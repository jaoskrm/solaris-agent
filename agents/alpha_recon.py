"""
Agent Alpha — Reconnaissance (Phase 2: Real Tools).

Uses Ollama local LLM to reason about recon tasks,
then executes real tools (nmap, nuclei) via the Docker sandbox.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import urlparse

from agents.a2a.messages import (
    A2AMessage,
    AgentRole,
    IntelligenceReport,
    MessageType,
    Priority,
)
from agents.state import RedTeamState
from agents.tools.registry import tool_registry
from core.ollama_client import ollama_client
from core.config import settings
from sandbox.sandbox_manager import ExecResult

logger = logging.getLogger(__name__)

ALPHA_SYSTEM_PROMPT = """You are Agent Alpha, a reconnaissance specialist on a red team.
You have REAL tools that execute against a live target. You must decide which tool to run and with what arguments.

AVAILABLE TOOLS:
{tools_description}

For each assigned task, respond with a JSON object specifying which tools to run:
{{
  "tool_calls": [
    {{
      "tool": "nmap" | "nuclei" | "curl",
      "args": {{
        "target": "the target URL or host",
        ... (tool-specific args)
      }},
      "reasoning": "why you're running this tool"
    }}
  ]
}}

IMPORTANT:
- These are REAL tools. nmap will actually scan. nuclei will actually probe for vulns.
- Use the target URL provided in the task, not made-up targets.
- Start broad (port scan) then narrow (specific vuln templates).
- Respond ONLY in JSON.
"""

ANALYZE_PROMPT = """You are Agent Alpha analyzing REAL tool output from reconnaissance.

TOOL: {tool_name}
COMMAND: {command}
EXIT CODE: {exit_code}
STDOUT:
{stdout}

STDERR:
{stderr}

Analyze this output and extract findings. Respond in JSON:
{{
  "findings": [
    {{
      "asset": "specific host/port/endpoint found",
      "finding": "what you discovered",
      "confidence": 0.0-1.0,
      "evidence": "relevant line from output",
      "cve_hint": "CVE-XXXX-XXXXX or null",
      "recommended_action": "what Gamma should exploit"
    }}
  ],
  "summary": "brief summary"
}}

If the tool returned no useful output or failed, return empty findings.
"""


async def alpha_recon(state: RedTeamState) -> dict[str, Any]:
    """
    Alpha Recon agent — executes real tools and analyzes output with LLM.
    """
    logger.info("Alpha: Executing recon for mission %s", state["mission_id"])

    # Find task assignments directed to Alpha
    tasks_for_alpha = []
    for msg in state.get("messages", []):
        if (
            isinstance(msg, A2AMessage)
            and msg.type == MessageType.TASK_ASSIGNMENT
            and msg.recipient == AgentRole.ALPHA
        ):
            tasks_for_alpha.append(msg.payload)

    if not tasks_for_alpha:
        logger.warning("Alpha: No tasks assigned, returning empty")
        return {"recon_results": [], "messages": []}

    # Get tool descriptions for the LLM
    tools_desc = tool_registry.get_prompt_description()

    tasks_str = json.dumps(tasks_for_alpha, indent=2, default=str)

    # Step 1: Ask LLM which tools to run
    plan_prompt = f"""ASSIGNED TASKS:
{tasks_str}

TARGET: {state['target']}

Decide which tools to run for these tasks. Respond in JSON."""

    response = await ollama_client.chat(
        model=settings.recon_model,
        messages=[
            {"role": "system", "content": ALPHA_SYSTEM_PROMPT.format(tools_description=tools_desc)},
            {"role": "user", "content": plan_prompt},
        ],
        temperature=0.2,
    )

    # Extract port from target URL for precision scanning
    port = _extract_port_from_target(state["target"])
    
    try:
        plan = _parse_json_response(response)
    except Exception as e:
        logger.error("Alpha plan parse failed: %s", e)
        # Fallback: run precision nmap scan on discovered port
        nmap_args = f"-sV -p {port}" if port else "-sV --top-ports 20"
        plan = {"tool_calls": [
            {"tool": "nmap", "args": {"target": state["target"], "args": nmap_args}, "reasoning": "Precision scan on target port"},
        ]}

    # Step 2: Execute each tool call
    all_findings: list[dict[str, Any]] = []
    new_messages: list[A2AMessage] = []

    for tool_call in plan.get("tool_calls", []):
        tool_name = tool_call.get("tool", "nmap")
        tool_args = tool_call.get("args", {})

        # Ensure mission_id is passed
        tool_args["mission_id"] = state["mission_id"]

        # Execute the tool
        logger.info("Alpha: Running %s with args: %s", tool_name, str(tool_args)[:100])
        result: ExecResult = await tool_registry.execute(tool_name, **tool_args)

        # Step 3: Analyze tool output with LLM
        analyze_prompt = ANALYZE_PROMPT.format(
            tool_name=tool_name,
            command=result.command,
            exit_code=result.exit_code,
            stdout=result.stdout[:3000] if result.stdout else "(empty)",
            stderr=result.stderr[:1000] if result.stderr else "(empty)",
        )

        analysis_response = await ollama_client.chat(
            model=settings.recon_model,
            messages=[
                {"role": "system", "content": "You are a security analyst parsing tool output. Respond ONLY in JSON."},
                {"role": "user", "content": analyze_prompt},
            ],
            temperature=0.1,
        )

        try:
            analysis = _parse_json_response(analysis_response)
        except Exception as e:
            logger.error("Alpha analysis parse failed: %s", e)
            analysis = {"findings": [{
                "asset": state["target"],
                "finding": f"{tool_name} returned exit code {result.exit_code}",
                "confidence": 0.3,
                "evidence": result.stdout[:200] if result.stdout else result.stderr[:200],
                "cve_hint": None,
                "recommended_action": "Manual review needed",
            }], "summary": f"{tool_name} completed with exit code {result.exit_code}"}

        # Convert findings to A2A messages
        for finding in analysis.get("findings", []):
            intel = IntelligenceReport(
                asset=finding.get("asset", state["target"]),
                finding=finding.get("finding", "Unknown"),
                confidence=min(max(finding.get("confidence", 0.5), 0.0), 1.0),
                evidence=finding.get("evidence", ""),
                cve_hint=finding.get("cve_hint"),
                recommended_action=finding.get("recommended_action", ""),
            )

            msg = A2AMessage(
                sender=AgentRole.ALPHA,
                recipient=AgentRole.COMMANDER,
                type=MessageType.INTELLIGENCE_REPORT,
                priority=Priority.HIGH if intel.confidence > 0.7 else Priority.MEDIUM,
                payload=intel.model_dump(),
            )
            new_messages.append(msg)
            all_findings.append(intel.model_dump())

    logger.info("Alpha: %d findings from %d tool calls", len(all_findings), len(plan.get("tool_calls", [])))

    return {
        "recon_results": all_findings,
        "messages": new_messages,
    }


def _parse_json_response(text: str) -> dict[str, Any]:
    """Extract JSON from LLM response."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)
    return json.loads(cleaned)


def _extract_port_from_target(target: str) -> str | None:
    """
    Extract port from target URL or host:port string.
    
    Examples:
        http://localhost:3000 -> 3000
        https://example.com:8443 -> 8443
        localhost:3000 -> 3000
        example.com -> None
    """
    # Try parsing as URL first
    if "://" in target:
        parsed = urlparse(target)
        if parsed.port:
            return str(parsed.port)
    
    # Try parsing as host:port
    match = re.match(r"^.+:(\d+)$", target)
    if match:
        return match.group(1)
    
    return None
