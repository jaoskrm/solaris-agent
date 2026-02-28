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
You have REAL tools that execute against a live target. You must discover attack surfaces and vulnerabilities.

⚠️ CRITICAL: YOU MUST ONLY OUTPUT VALID JSON. NO CONVERSATIONAL FILLER.

AVAILABLE TOOLS:
{tools_description}

═══════════════════════════════════════════════════════════════════
RECONNAISSANCE OBJECTIVES (HUNT FOR):
═══════════════════════════════════════════════════════════════════

1. **API Discovery**
   - Find all API endpoints: /api/*, /rest/*, /graphql, /swagger
   - Document: endpoint path, HTTP methods allowed, authentication requirements

2. **IDOR Pattern Discovery**
   - Identify numeric ID patterns: /api/users/1, /api/orders/123
   - Look for: sequential IDs, UUIDs, predictable identifiers
   - Test parameter: id, user_id, order_id, file_id

3. **Sensitive Endpoint Detection**
   - Hunt for: /.env, /.git/config, /config.json, /swagger.json
   - Check: /robots.txt, /sitemap.xml, /.well-known/
   - Try: /admin, /manage, /dashboard, /console

4. **Input Vector Mapping**
   - Find all user input points: search, login, registration, comments
   - Document: parameter names, data types, validation patterns
   - Test for: reflected values, error messages, response differences

5. **Authentication Analysis**
   - Identify: login endpoints, session mechanisms, token patterns
   - Look for: JWT in responses, cookie settings, CORS headers

═══════════════════════════════════════════════════════════════════

For each assigned task, respond with a JSON object specifying which tools to run:
{{
  "tool_calls": [
    {{
      "tool": "nmap" | "nuclei" | "curl",
      "args": {{
        "target": "the target URL or host",
        "args": "specific arguments for the tool"
      }},
      "reasoning": "what specific vulnerability or pattern this will discover"
    }}
  ]
}}

IMPORTANT:
- These are REAL tools. nmap will actually scan. nuclei will actually probe for vulns.
- Use the target URL provided in the task, not made-up targets.
- Start broad (port scan) then narrow (specific vuln templates).
- Focus on DISCOVERING patterns that Gamma can exploit (IDOR endpoints, input vectors, etc.)

⚠️ CRITICAL: YOU MUST ONLY OUTPUT VALID JSON. DO NOT INCLUDE CONVERSATIONAL FILLER OR MARKDOWN CODE BLOCKS. YOUR ENTIRE RESPONSE MUST BE PARSEABLE AS JSON.
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
    logger.info("Alpha: Executing recon for mission %s", state.get("mission_id", "unknown"))

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

TARGET: {state.get('target', 'http://localhost:3000')}

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
    port = _extract_port_from_target(state.get("target", "http://localhost:3000"))
    
    try:
        plan = _parse_json_response(response)
    except Exception as e:
        logger.error("Alpha plan parse failed: %s", e)
        # Fallback: run precision nmap scan on discovered port
        nmap_args = f"-sV -p {port}" if port else "-sV --top-ports 20"
        plan = {"tool_calls": [
            {"tool": "nmap", "args": {"target": state.get('target', 'http://localhost:3000'), "args": nmap_args}, "reasoning": "Precision scan on target port"},
        ]}

    # Step 2: Execute each tool call
    all_findings: list[dict[str, Any]] = []
    new_messages: list[A2AMessage] = []

    for tool_call in plan.get("tool_calls", []):
        tool_name = tool_call.get("tool", "nmap")
        tool_args = tool_call.get("args", {})

        # Ensure mission_id is passed
        tool_args["mission_id"] = state.get("mission_id", "unknown")

        # Execute the tool
        logger.info("Alpha: Running %s with args: %s", tool_name, str(tool_args)[:100])
        result: ExecResult = await tool_registry.execute(tool_name, **tool_args)

        # ACTION LOG: Print first 10 lines of tool output for judges
        output_lines = result.stdout.split('\n')[:10] if result.stdout else []
        if output_lines:
            print(f"\n🔵 ALPHA ACTION: {tool_name}")
            for i, line in enumerate(output_lines, 1):
                if line.strip():
                    print(f"  {i}: {line[:120]}")
            if len(result.stdout.split('\n')) > 10:
                print(f"  ... ({len(result.stdout.split(chr(10))) - 10} more lines)")
            print(f"  Exit code: {result.exit_code}")
            print()

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
                "asset": state.get('target', 'http://localhost:3000'),
                "finding": f"{tool_name} returned exit code {result.exit_code}",
                "confidence": 0.3,
                "evidence": result.stdout[:200] if result.stdout else result.stderr[:200],
                "cve_hint": None,
                "recommended_action": "Manual review needed",
            }], "summary": f"{tool_name} completed with exit code {result.exit_code}"}

        # Convert findings to A2A messages
        for finding in analysis.get("findings", []):
            intel = IntelligenceReport(
                asset=finding.get("asset", state.get('target', 'http://localhost:3000')),
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
    """Extract JSON from LLM response with aggressive repair."""
    # First try the simple approach
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)
    
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try aggressive repair from core.parsing
        try:
            from core.parsing import sanitize_json_output
            result = sanitize_json_output(text)
            if result is not None and isinstance(result, dict):
                return result
        except Exception:
            pass
        # If all else fails, re-raise the original error
        raise


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
