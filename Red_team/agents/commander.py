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
from core.llm_client import llm_client
from core.config import settings
from core.parsing import parse_with_retry, sanitize_json_output

logger = logging.getLogger(__name__)

# ANSI color codes for Bold Yellow
BOLD_YELLOW = "\033[1;33m"
RESET = "\033[0m"

def _truncate_to_tokens(text: str, max_tokens: int = 4096, avg_chars_per_token: int = 4) -> str:
    """Truncate text to stay within token limit for Ollama speed optimization."""
    max_chars = max_tokens * avg_chars_per_token
    if len(text) <= max_chars:
        return text
    # Truncate and add indicator
    truncated = text[:max_chars]
    # Find last complete sentence or line break
    last_break = max(truncated.rfind('\n'), truncated.rfind('. '))
    if last_break > max_chars * 0.8:  # Only use break if it's within last 20%
        truncated = truncated[:last_break + 1]
    return truncated + f"\n\n[Content truncated to {max_tokens} tokens for Ollama compatibility]"


def _get_llm_client():
    """Get the appropriate LLM client - OpenRouter primary, Ollama fallback."""
    logger.info("Using unified LLM client (OpenRouter primary, Ollama fallback)")
    return "unified", llm_client

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
6. ADAPTIVE DEFENSE EVASION: You must actively monitor the Blue Team's defensive analytics. If the Blue Team detects your specific payload or blocks your attack vector, you must immediately route Gamma to pivot to a completely different endpoint or evasion technique. Never persist with a blocked approach.

⚠️ CRITICAL: YOU MUST ONLY OUTPUT VALID JSON. DO NOT INCLUDE CONVERSATIONAL FILLER OR MARKDOWN CODE BLOCKS. YOUR ENTIRE RESPONSE MUST BE PARSEABLE AS JSON.
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

# PentAGI: Vector Rotation Policy - Track successful exploit types
SUCCESSFUL_VECTORS = "successful_vectors"
COMPROMISED_ENDPOINTS = "compromised_endpoints"
STEALTH_MODE = "stealth_mode"

OBSERVE_PROMPT = """MISSION OBJECTIVE: {objective}
TARGET: {target}

CURRENT STRATEGY: {strategy}

ITERATION: {iteration}/{max_iterations}

🚫 FORBIDDEN ENDPOINTS (Blocked by Blue Team HIGH severity alerts for 5 iterations):
{forbidden_endpoints}

🔴 COMPROMISED ENDPOINTS (Successfully exploited - DO NOT REPEAT):
{compromised_endpoints}

📊 STRATEGY MEMORY (Successful Vectors - Rotate to different category):
{successful_vectors}

🛡️ STEALTH MODE STATUS: {stealth_mode}

BLUE TEAM DEFENSIVE INTELLIGENCE:
{blue_team_intel}

INTELLIGENCE RECEIVED:
{reports}

BLACKBOARD STATE:
{blackboard}

**VECTOR ROTATION POLICY (MANDATORY - PRD v4.0 COMPLIANCE):**
1. You MUST rotate through at least 3 distinct OWASP categories before mission completion
2. If SQLi was successful, you MUST pivot to XSS, IDOR, Sensitive Data Exposure, or Auth Bypass next
3. If an endpoint was compromised (session token found), mark it and move to a DIFFERENT endpoint
4. Never repeat the same exploit type on the same endpoint twice
5. Prioritize unexplored OWASP Top 10 categories: A01-A10
6. Document the KILL CHAIN NARRATIVE: Finding A → Asset B → Exploit C (show the progression)

**DYNAMIC TOKEN CHAINING:**
- If Gamma reports a valid session token/JWT, you MUST instruct subsequent exploits to include it in Authorization headers
- Chain exploits: Auth Bypass → Token Discovery → Privilege Escalation (IDOR on admin endpoints)
- Tokens are only valid if Critic verifies 200 OK + sensitive data presence

**WAF ADAPTATION:**
- If Critic reports WAF_BLOCK or 403 Forbidden, Gamma MUST retry with encoding (URL, Base64, hex)
- Rotate payloads: plain → URL encoded → double URL encoded → Base64 wrapped

**STEALTH MODE ACTIVATION:**
- If defense_analytics count > 3 OR high severity alerts detected
- Use: Custom headers (X-Forwarded-For, User-Agent rotation), URL encoding, parameter fragmentation
- Switch from automated tools to manual curl with delays

Based on the intelligence reports from your agents AND the Blue Team's defensive analytics:
1. Analyze what was found
2. Check if any of your previous payloads were detected/blocked by the Blue Team
3. **CRITICAL**: If an endpoint is in FORBIDDEN ENDPOINTS list, DO NOT attack it - pivot to a different target
4. **CRITICAL**: If an exploit was successful, mark endpoint as COMPROMISED and rotate to a different vector
5. If blocked or detection is high, activate STEALTH MODE and pivot to a different approach
6. Decide the next phase: continue recon, move to exploitation, or complete the mission
7. Issue new task assignments OR declare mission complete

**MANDATORY RULES:**
- Never target FORBIDDEN ENDPOINTS until the 5-iteration ban expires
- Never repeat successful exploit types on the same endpoint
- Always rotate through different OWASP categories (SQLi → XSS → IDOR → LFI → Auth Bypass)

Respond with a JSON object:
{{
  "analysis": "Your analysis of the intelligence",
  "next_phase": "recon" or "exploitation" or "complete",
  "strategy": "Updated strategy with specific vector rotation plan",
  "stealth_mode": true or false,
  "tasks": [
    {{
      "agent": "agent_alpha" or "agent_gamma",
      "description": "What to do next - MUST be a different vector than before",
      "target": "Specific target",
      "tools_allowed": ["nmap", "nuclei", "curl", "python"],
      "priority": "HIGH" or "MEDIUM" or "LOW",
      "exploit_type": "sqli|xss|idor|lfi|auth_bypass|info_disclosure"
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
    logger.info("Commander: Planning mission %s", state.get("mission_id", "unknown"))

    blackboard_str = json.dumps(state.get("blackboard", {}), indent=2)

    prompt = PLAN_PROMPT.format(
        objective=state.get("objective", "Perform reconnaissance"),
        target=state.get("target", "http://localhost:3000"),
        blackboard=blackboard_str if blackboard_str != "{}" else "(empty — first iteration)",
    )

    # Use Ollama for Commander (local only)
    client_type, client = _get_llm_client()
    # Use OpenRouter as primary, Ollama as fallback
    primary_model = settings.commander_model
    fallback_model = settings.commander_model_fallback
    
    # Truncate prompts to 4096 tokens for Ollama speed optimization
    system_prompt = _truncate_to_tokens(COMMANDER_SYSTEM_PROMPT, max_tokens=4096)
    user_prompt = _truncate_to_tokens(prompt, max_tokens=4096)
    
    try:
        response = await client.chat(
            model=primary_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            fallback_model=fallback_model,
        )
        logger.debug("Commander using %s with primary model %s (fallback: %s)", client_type, primary_model, fallback_model)
    except Exception as e:
        logger.error("LLM request failed: %s", e)
        return {
            "errors": [f"LLM request failed: {e}"],
            "phase": "recon",
            "strategy": "Fallback: perform broad reconnaissance on the target.",
            "current_tasks": [],
            "messages": [],
        }

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

    # PentAGI v4.0: Read shared findings for token chaining
    shared_tokens = {}
    try:
        from core.redis_bus import redis_bus
        shared_tokens = await redis_bus.findings_read(state.get("mission_id", "default"), "tokens")
        if shared_tokens:
            logger.info("Commander: Found %d shared tokens for task injection", len(shared_tokens))
    except Exception:
        pass

    # Build A2A messages for each task
    new_messages: list[A2AMessage] = []
    task_dicts: list[dict[str, Any]] = []

    for task_spec in tasks:
        agent = task_spec.get("agent", "agent_alpha")
        task = TaskAssignment(
            description=task_spec.get("description", "Perform reconnaissance"),
            target=task_spec.get("target", state.get('target', 'http://localhost:3000')),
            tools_allowed=task_spec.get("tools_allowed", []),
        )
        task_payload = task.model_dump()
        # Inject shared tokens so Gamma receives them
        if shared_tokens:
            task_payload["found_tokens"] = shared_tokens
        msg = A2AMessage(
            sender=AgentRole.COMMANDER,
            recipient=AgentRole(agent),
            type=MessageType.TASK_ASSIGNMENT,
            priority=Priority(task_spec.get("priority", "MEDIUM")),
            payload=task_payload,
        )
        new_messages.append(msg)
        task_dicts.append(task_payload)

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

    # --- STRATEGY MEMORY: Track successful exploits and compromised endpoints ---
    blackboard = state.get("blackboard", {})
    successful_vectors: list[str] = blackboard.get(SUCCESSFUL_VECTORS, [])
    compromised_endpoints: list[str] = blackboard.get(COMPROMISED_ENDPOINTS, [])
    stealth_mode: bool = blackboard.get(STEALTH_MODE, False)
    
    # Analyze reports for successful exploits
    for report in reports:
        payload = report.get("payload", {})
        if isinstance(payload, dict):
            # Check for successful exploit
            if payload.get("success"):
                exploit_type = payload.get("exploit_type", "unknown")
                target = payload.get("target", "")
                
                # Track successful vector type
                if exploit_type and exploit_type not in successful_vectors:
                    successful_vectors.append(exploit_type)
                    logger.info(f"🎯 Commander: New successful vector '{exploit_type}' added to Strategy Memory")
                
                # Track compromised endpoint (if session token found)
                if payload.get("session_token_found") or payload.get("evidence", "").lower().find("token") != -1:
                    if target and target not in compromised_endpoints:
                        compromised_endpoints.append(target)
                        logger.info(f"🔓 Commander: Endpoint '{target}' marked as COMPROMISED")
    
    # Format strategy memory for prompt
    successful_vectors_str = ", ".join(successful_vectors) if successful_vectors else "(none yet)"
    compromised_endpoints_str = "\n".join([f"  - {ep}" for ep in compromised_endpoints]) if compromised_endpoints else "(none yet)"

    # Fetch Blue Team defensive analytics from Redis
    blue_team_intel = "(no defensive analytics available)"
    forbidden_endpoints: list[str] = blackboard.get("forbidden_endpoints", [])
    high_severity_detected = False
    defense_alert_count = 0
    
    try:
        from core.redis_bus import redis_bus
        # Try to get latest defense intel (non-blocking, <100ms)
        defense_intel = await redis_bus.get_latest_defense_intel(count=20)
        if defense_intel:
            # Format the defense intel for the prompt
            intel_summary = []
            for intel in defense_intel:
                severity = intel.get('severity', 'unknown').upper()
                summary = f"- [{severity}] {intel.get('vulnerability_type', 'unknown')}: {intel.get('description', '')}"
                if intel.get('blocked_payload'):
                    summary += f" [BLOCKED: {intel.get('blocked_payload')[:50]}...]"
                if intel.get('detected_signature'):
                    summary += f" [DETECTED BY: {intel.get('detected_signature')}]"
                intel_summary.append(summary)
                
                # CRITICAL: If HIGH severity, mark endpoint as FORBIDDEN
                if severity == 'HIGH':
                    high_severity_detected = True
                    blocked_endpoint = intel.get('endpoint') or intel.get('target') or state.get('target', 'http://localhost:3000')
                    if blocked_endpoint and blocked_endpoint not in forbidden_endpoints:
                        forbidden_endpoints.append(blocked_endpoint)
                        logger.warning(f"🚫 Commander: Marking {blocked_endpoint} as FORBIDDEN for 5 iterations (HIGH severity detected)")
            
            blue_team_intel = "\n".join(intel_summary)
            defense_alert_count = len(defense_intel)
            logger.info(f"Commander: Received {defense_alert_count} defense analytics from Blue Team")
            
            # --- STEALTH MODE ACTIVATION ---
            # Activate stealth mode if >3 alerts or high severity detected
            if defense_alert_count > 3 or high_severity_detected:
                if not stealth_mode:
                    stealth_mode = True
                    logger.warning("🛡️ Commander: STEALTH MODE ACTIVATED - Blue Team detection high")
            
            # Update blackboard with forbidden endpoints (5 iteration countdown)
            if high_severity_detected:
                await redis_bus.blackboard_write(
                    state.get("mission_id", "default"), 
                    "forbidden_endpoints", 
                    forbidden_endpoints
                )
                await redis_bus.blackboard_write(
                    state.get("mission_id", "default"),
                    "forbidden_until_iteration",
                    state.get("iteration", 0) + 5
                )
    except Exception as e:
        logger.debug(f"Could not fetch Blue Team intel: {e}")

    # Format forbidden endpoints for display
    forbidden_str = "(none - all endpoints available)"
    if forbidden_endpoints:
        forbidden_str = "\n".join([f"  - {ep} (FORBIDDEN for 5 iterations)" for ep in forbidden_endpoints])
    
    # Format stealth mode status
    stealth_mode_str = "ACTIVE - Use encoded payloads, custom headers, slower timing" if stealth_mode else "OFF - Normal operations"
    
    prompt = OBSERVE_PROMPT.format(
        objective=state.get("objective", "Perform reconnaissance"),
        target=state.get('target', 'http://localhost:3000'),
        strategy=state.get("strategy", "Initial reconnaissance"),
        iteration=state.get("iteration", 0),
        max_iterations=state.get("max_iterations", 5),
        blue_team_intel=blue_team_intel,
        reports=reports_str,
        blackboard=blackboard_str,
        forbidden_endpoints=forbidden_str,
        compromised_endpoints=compromised_endpoints_str,
        successful_vectors=successful_vectors_str,
        stealth_mode=stealth_mode_str,
    )

    # Use OpenRouter as primary, Ollama as fallback
    client_type, client = _get_llm_client()
    primary_model = settings.commander_model
    fallback_model = settings.commander_model_fallback
    
    # Truncate prompts to 4096 tokens for Ollama speed optimization
    system_prompt = _truncate_to_tokens(COMMANDER_SYSTEM_PROMPT, max_tokens=4096)
    user_prompt = _truncate_to_tokens(prompt, max_tokens=4096)
    
    try:
        response = await client.chat(
            model=primary_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            fallback_model=fallback_model,
        )
        logger.debug("Commander using %s with primary model %s (fallback: %s)", client_type, primary_model, fallback_model)
    except Exception as e:
        logger.error("LLM request failed: %s", e)
        return {
            "errors": [f"LLM request failed: {e}"],
            "phase": "complete",
            "strategy": state.get("strategy", "Mission failed - LLM error"),
            "current_tasks": [],
            "messages": [],
        }

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

    # PentAGI v4.0: Read shared findings for observe-phase task injection
    shared_tokens_obs = {}
    try:
        from core.redis_bus import redis_bus
        shared_tokens_obs = await redis_bus.findings_read(state.get("mission_id", "default"), "tokens")
    except Exception:
        pass

    for task_spec in tasks:
        agent = task_spec.get("agent", "agent_alpha")
        task = TaskAssignment(
            description=task_spec.get("description", "Continue operations"),
            target=task_spec.get("target", state.get('target', 'http://localhost:3000')),
            tools_allowed=task_spec.get("tools_allowed", []),
        )
        task_payload = task.model_dump()
        if shared_tokens_obs:
            task_payload["found_tokens"] = shared_tokens_obs
        msg = A2AMessage(
            sender=AgentRole.COMMANDER,
            recipient=AgentRole(agent),
            type=MessageType.TASK_ASSIGNMENT,
            priority=Priority(task_spec.get("priority", "MEDIUM")),
            payload=task_payload,
        )
        new_messages.append(msg)
        task_dicts.append(task_payload)

    # Update blackboard with analysis and strategy memory
    blackboard_update = dict(state.get("blackboard", {}))
    blackboard_update["last_analysis"] = result.get("analysis", "")
    blackboard_update["current_strategy"] = strategy
    
    # Persist Strategy Memory
    blackboard_update[SUCCESSFUL_VECTORS] = successful_vectors
    blackboard_update[COMPROMISED_ENDPOINTS] = compromised_endpoints
    blackboard_update[STEALTH_MODE] = result.get("stealth_mode", stealth_mode)
    
    # Log vector rotation status
    if successful_vectors:
        logger.info(f"🎯 Commander: Strategy Memory contains {len(successful_vectors)} successful vectors: {successful_vectors}")
    if compromised_endpoints:
        logger.info(f"🔓 Commander: {len(compromised_endpoints)} endpoints marked as compromised")
    if blackboard_update[STEALTH_MODE]:
        logger.warning("🛡️ Commander: Operating in STEALTH MODE")

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
    """Extract JSON from LLM response using robust parsing."""
    # Use robust parser that handles markdown, truncation, etc.
    result = parse_with_retry(text)
    if result is not None and isinstance(result, dict):
        return result
    
    # Fallback to sanitize
    sanitized = sanitize_json_output(text)
    if sanitized is not None and isinstance(sanitized, dict):
        return sanitized
    
    # Last resort: try raw JSON
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)
    return json.loads(cleaned)
