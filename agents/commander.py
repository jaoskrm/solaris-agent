"""
Commander Agent — The Brain.

Uses OpenRouter Qwen3-235B to:
  1. plan() — Decompose objective into task assignments for Alpha/Gamma
  2. observe() — Evaluate agent reports, decide next phase or terminate

The Commander NEVER executes tools directly. It only issues orders
and evaluates intelligence.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from agents.a2a.messages import (
    A2AMessage,
    AgentRole,
    MessageType,
    Priority,
    TaskAssignment,
)
from agents.state import RedTeamState
from core.openrouter_client import openrouter_client
from core.ollama_client import ollama_client
from core.config import settings

logger = logging.getLogger(__name__)


def _get_llm_client():
    """Get the appropriate LLM client based on configuration."""
    # Commander uses OpenRouter (cloud) per PRD
    if settings.openrouter_api_key and not settings.openrouter_api_key.startswith("sk-or-v1-your"):
        return "openrouter", openrouter_client
    # Fallback to Ollama if OpenRouter not configured
    logger.warning("OpenRouter not configured, falling back to Ollama for Commander")
    return "ollama", ollama_client

COMMANDER_SYSTEM_PROMPT = """You are the Commander of an autonomous red team operation.
Your role is to think like an adversary conducting a real penetration test.

You have two field agents:
- Agent Alpha (Recon): Performs reconnaissance — port scanning, vulnerability scanning, git history mining. Tools: nmap, nuclei.
- Agent Gamma (Exploit): Executes exploits — SQL injection, XSS, authentication bypass, payload crafting. Tools: curl, python, nuclei templates.

RULES:
1. You NEVER execute tools yourself. You only issue TASK_ASSIGNMENT orders.
2. Think in terms of the cyber kill chain: Recon → Weaponize → Deliver → Exploit → Install → C2 → Actions.
3. Prioritize findings by impact — auth bypass and data exfiltration over cosmetic issues.
4. After receiving intelligence reports, re-evaluate strategy before issuing next tasks.
5. When you have enough evidence of compromise or no more productive paths, declare the mission complete.

Respond ONLY in valid JSON. No markdown, no explanations outside JSON.
"""

PLAN_PROMPT = """MISSION OBJECTIVE: {objective}
TARGET: {target}

Current blackboard intelligence:
{blackboard}

Generate a list of task assignments for your agents to begin reconnaissance.
Respond with a JSON object:
{{
  "strategy": "Your overall attack strategy in 2-3 sentences.",
  "tasks": [
    {{
      "agent": "agent_alpha" or "agent_gamma",
      "description": "What to do",
      "target": "Specific target (URL, IP, etc.)",
      "tools_allowed": ["nmap", "nuclei", "curl", "python"],
      "priority": "HIGH" or "MEDIUM" or "LOW"
    }}
  ]
}}
"""

OBSERVE_PROMPT = """MISSION OBJECTIVE: {objective}
TARGET: {target}

CURRENT STRATEGY: {strategy}

ITERATION: {iteration}/{max_iterations}

INTELLIGENCE RECEIVED:
{reports}

BLACKBOARD STATE:
{blackboard}

Based on the intelligence reports from your agents:
1. Analyze what was found
2. Decide the next phase: continue recon, move to exploitation, or complete the mission
3. Issue new task assignments OR declare mission complete

Respond with a JSON object:
{{
  "analysis": "Your analysis of the intelligence",
  "next_phase": "recon" or "exploitation" or "complete",
  "strategy": "Updated strategy",
  "tasks": [
    {{
      "agent": "agent_alpha" or "agent_gamma",
      "description": "What to do next",
      "target": "Specific target",
      "tools_allowed": ["nmap", "nuclei", "curl", "python"],
      "priority": "HIGH" or "MEDIUM" or "LOW"
    }}
  ]
}}

If next_phase is "complete", set tasks to an empty list.
"""


async def commander_plan(state: RedTeamState) -> dict[str, Any]:
    """
    Commander planning node.
    Reads the mission objective and generates initial task assignments.
    """
    logger.info("Commander: Planning mission %s", state["mission_id"])

    blackboard_str = json.dumps(state.get("blackboard", {}), indent=2)

    prompt = PLAN_PROMPT.format(
        objective=state["objective"],
        target=state["target"],
        blackboard=blackboard_str if blackboard_str != "{}" else "(empty — first iteration)",
    )

    # Use OpenRouter for Commander per PRD (with Ollama fallback)
    client_type, client = _get_llm_client()
    model = settings.commander_model
    
    try:
        response = await client.chat(
            model=model,
            messages=[
                {"role": "system", "content": COMMANDER_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )
        logger.debug("Commander using %s with model %s", client_type, model)
    except Exception as e:
        # Fallback to Ollama if OpenRouter fails
        if client_type == "openrouter":
            logger.warning("OpenRouter failed (%s), falling back to Ollama", e)
            # Use a model that's available locally
            local_model = settings.exploit_model  # qwen2.5-coder:7b-instruct
            response = await ollama_client.chat(
                model=local_model,
                messages=[
                    {"role": "system", "content": COMMANDER_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            )
            logger.info("Commander fell back to Ollama with model %s", local_model)
        else:
            raise

    try:
        plan = _parse_json_response(response)
    except Exception as e:
        logger.error("Commander plan parse failed: %s", e)
        return {
            "errors": [f"Commander plan parse error: {e}"],
            "phase": "recon",
            "strategy": "Fallback: perform broad reconnaissance on the target.",
            "current_tasks": [],
            "messages": [],
        }

    strategy = plan.get("strategy", "Perform initial reconnaissance.")
    tasks = plan.get("tasks", [])

    # Build A2A messages for each task
    new_messages: list[A2AMessage] = []
    task_dicts: list[dict[str, Any]] = []

    for task_spec in tasks:
        agent = task_spec.get("agent", "agent_alpha")
        task = TaskAssignment(
            description=task_spec.get("description", "Perform reconnaissance"),
            target=task_spec.get("target", state["target"]),
            tools_allowed=task_spec.get("tools_allowed", []),
        )
        msg = A2AMessage(
            sender=AgentRole.COMMANDER,
            recipient=AgentRole(agent),
            type=MessageType.TASK_ASSIGNMENT,
            priority=Priority(task_spec.get("priority", "MEDIUM")),
            payload=task.model_dump(),
        )
        new_messages.append(msg)
        task_dicts.append(task.model_dump())

    logger.info("Commander: Issued %d tasks, strategy: %s", len(tasks), strategy[:100])

    return {
        "phase": "recon",
        "strategy": strategy,
        "current_tasks": task_dicts,
        "messages": new_messages,
    }


async def commander_observe(state: RedTeamState) -> dict[str, Any]:
    """
    Commander observation node.
    Evaluates agent reports and decides what to do next.
    """
    logger.info(
        "Commander: Observing results — iteration %d/%d",
        state.get("iteration", 0),
        state.get("max_iterations", 5),
    )

    # Gather reports from agents
    reports = []
    for msg in state.get("messages", []):
        if isinstance(msg, A2AMessage) and msg.type in (
            MessageType.INTELLIGENCE_REPORT,
            MessageType.EXPLOIT_RESULT,
        ):
            reports.append({
                "from": msg.sender.value if isinstance(msg.sender, AgentRole) else msg.sender,
                "type": msg.type.value if isinstance(msg.type, MessageType) else msg.type,
                "payload": msg.payload,
            })

    reports_str = json.dumps(reports, indent=2, default=str) if reports else "(no reports yet)"
    blackboard_str = json.dumps(state.get("blackboard", {}), indent=2, default=str)

    prompt = OBSERVE_PROMPT.format(
        objective=state["objective"],
        target=state["target"],
        strategy=state.get("strategy", "Initial reconnaissance"),
        iteration=state.get("iteration", 0),
        max_iterations=state.get("max_iterations", 5),
        reports=reports_str,
        blackboard=blackboard_str,
    )

    # Use OpenRouter for Commander per PRD (with Ollama fallback)
    client_type, client = _get_llm_client()
    model = settings.commander_model
    
    try:
        response = await client.chat(
            model=model,
            messages=[
                {"role": "system", "content": COMMANDER_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )
        logger.debug("Commander using %s with model %s", client_type, model)
    except Exception as e:
        # Fallback to Ollama if OpenRouter fails
        if client_type == "openrouter":
            logger.warning("OpenRouter failed (%s), falling back to Ollama", e)
            local_model = settings.exploit_model
            response = await ollama_client.chat(
                model=local_model,
                messages=[
                    {"role": "system", "content": COMMANDER_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            )
            logger.info("Commander fell back to Ollama with model %s", local_model)
        else:
            raise

    try:
        result = _parse_json_response(response)
    except Exception as e:
        logger.error("Commander observe parse failed: %s", e)
        return {
            "errors": [f"Commander observe parse error: {e}"],
            "phase": "complete",
            "current_tasks": [],
            "messages": [],
        }

    next_phase = result.get("next_phase", "complete")
    strategy = result.get("strategy", state.get("strategy", ""))
    tasks = result.get("tasks", [])

    new_messages: list[A2AMessage] = []
    task_dicts: list[dict[str, Any]] = []

    for task_spec in tasks:
        agent = task_spec.get("agent", "agent_alpha")
        task = TaskAssignment(
            description=task_spec.get("description", "Continue operations"),
            target=task_spec.get("target", state["target"]),
            tools_allowed=task_spec.get("tools_allowed", []),
        )
        msg = A2AMessage(
            sender=AgentRole.COMMANDER,
            recipient=AgentRole(agent),
            type=MessageType.TASK_ASSIGNMENT,
            priority=Priority(task_spec.get("priority", "MEDIUM")),
            payload=task.model_dump(),
        )
        new_messages.append(msg)
        task_dicts.append(task.model_dump())

    # Update blackboard with analysis
    blackboard_update = dict(state.get("blackboard", {}))
    blackboard_update["last_analysis"] = result.get("analysis", "")
    blackboard_update["current_strategy"] = strategy

    logger.info("Commander: next_phase=%s, issued %d new tasks", next_phase, len(tasks))

    return {
        "phase": next_phase,
        "strategy": strategy,
        "current_tasks": task_dicts,
        "blackboard": blackboard_update,
        "messages": new_messages,
        "iteration": state.get("iteration", 0) + 1,
    }


def _parse_json_response(text: str) -> dict[str, Any]:
    """Extract JSON from LLM response, handling markdown fencing."""
    cleaned = text.strip()

    # Strip markdown code fences if present
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Remove first line (```json or ```) and last line (```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)

    return json.loads(cleaned)
