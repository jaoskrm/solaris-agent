"""
Critic Agent — The Evaluator for PentAGI-Style Exploit Loop.

The Critic receives raw tool execution results and evaluates:
- Success or Failure with evidence
- Specific error types (syntax, WAF, auth, etc.)
- Actionable feedback for self-correction

This enables the Actor-Critic loop:
  Gamma (Plan/Execute) → Sandbox → Critic (Evaluate) → Gamma (Adjust) → ...
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from core.ollama_client import ollama_client
from core.config import settings
from sandbox.sandbox_manager import ExecResult

logger = logging.getLogger(__name__)


# Error type patterns for automatic detection
ERROR_PATTERNS = {
    "syntax_error": [
        r"SyntaxError:",
        r"Parse error",
        r"unexpected token",
        r"JSONDecodeError",
        r"IndentationError",
        r"NameError:",
    ],
    "waf_block": [
        r"403 Forbidden",
        r"403 Forbidden",
        r"WAF",
        r"ModSecurity",
        r"blocked",
        r"detected malicious",
    ],
    "auth_failure": [
        r"401 Unauthorized",
        r"403 Forbidden",
        r"Invalid credentials",
        r"login failed",
        r"Session expired",
    ],
    "timeout": [
        r"timeout",
        r"timed out",
        r"Connection timed out",
        r"Request timeout",
    ],
    "not_found": [
        r"404 Not Found",
        r"404",
        r"Endpoint not found",
        r"Cannot GET",
    ],
    "rate_limit": [
        r"429 Too Many Requests",
        r"rate limit",
        r"too many requests",
    ],
}


CRITIC_SYSTEM_PROMPT = """You are the Critic — a meticulous security analyst who evaluates exploit attempts.
Your role is to provide STRUCTURED, ACTIONABLE feedback to the exploit specialist.

OUTPUT FORMAT: You MUST respond ONLY in valid JSON with this exact structure:

{{
  "success": true|false,
  "evidence": "The specific data that proves success or failure (max 500 chars)",
  "error_type": "none|syntax_error|waf_block|auth_failure|timeout|not_found|rate_limit|unknown",
  "feedback": "Specific, actionable advice for the exploit specialist on how to fix the failure. 
               If success=true, briefly confirm what worked.",
  "severity": "critical|high|medium|low|none",
  "session_token_found": true|false,
  "session_token_value": "if session_token_found=true, extract the token value"
}}

SUCCESS CRITERIA:
- SQLi: Boolean-based true/false in response, UNION works, or authentication bypassed
- XSS: Script tags executed, alert() called, or payload reflected unescaped
- Auth Bypass: Access to admin panel, elevated privileges, or unauthorized data
- IDOR: Access to other users' data without authentication
- Command Injection: Command executed successfully, output returned

FAILURE ANALYSIS:
- syntax_error: Python/curl syntax is wrong — fix syntax before changing exploit logic
- waf_block: WAF detected the payload — try encoding, obfuscation, or different vectors
- auth_failure: Authentication/authorization failed — try different credentials or sessions
- timeout: Target not responding — try slower timing attacks or different endpoints
- not_found: Endpoint doesn't exist — verify path from recon or try alternatives
- rate_limit: Too many requests — slow down or use different IPs
"""


CRITIC_ANALYSIS_PROMPT = """Analyze this exploit attempt result:

EXPLOIT TYPE: {exploit_type}
TOOL USED: {tool_name}
COMMAND EXECUTED: {command}
EXIT CODE: {exit_code}

STDOUT:
{stdout}

STDERR:
{stderr}

INTELLENCE CONTEXT:
{intel}

Previous attempts (for contextual memory):
{previous_attempts}

Analyze and respond in JSON format."""


async def analyze_exploit_result(
    exploit_type: str,
    tool_name: str,
    command: str,
    result: ExecResult,
    intel: list[dict] | None = None,
    previous_attempts: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Main entry point — analyze an exploit result using the Critic agent.
    
    Returns a structured evaluation with success/failure, error type, and feedback.
    """
    logger.info(f"Critic: Analyzing {exploit_type} exploit result (exit code: {result.exit_code})")
    
    # Build context for the Critic
    intel_str = json.dumps(intel, indent=2, default=str) if intel else "(no intelligence available)"
    prev_str = json.dumps(previous_attempts, indent=2, default=str) if previous_attempts else "(no previous attempts)"
    
    # Build the analysis prompt
    analysis_prompt = CRITIC_ANALYSIS_PROMPT.format(
        exploit_type=exploit_type,
        tool_name=tool_name,
        command=command[:500],  # Truncate long commands
        exit_code=result.exit_code,
        stdout=result.stdout[:3000] if result.stdout else "(empty)",
        stderr=result.stderr[:1000] if result.stderr else "(empty)",
        intel=intel_str,
        previous_attempts=prev_str,
    )
    
    # Call the Critic LLM
    try:
        response = await ollama_client.chat(
            model=settings.exploit_model,  # Use same model as Gamma for consistency
            messages=[
                {"role": "system", "content": CRITIC_SYSTEM_PROMPT},
                {"role": "user", "content": analysis_prompt},
            ],
            temperature=0.1,  # Low temperature for consistent evaluation
        )
        
        evaluation = _parse_critic_response(response)
        
        # Also run automatic error detection as backup
        if evaluation.get("error_type") == "unknown":
            auto_detected = _auto_detect_error_type(result)
            if auto_detected != "none":
                evaluation["error_type"] = auto_detected
                evaluation["feedback"] = f"Auto-detected {auto_detected}. {evaluation.get('feedback', '')}"
        
        logger.info(f"Critic: Evaluation complete - success={evaluation.get('success')}, error_type={evaluation.get('error_type')}")
        return evaluation
        
    except Exception as e:
        logger.error(f"Critic: Analysis failed with exception: {e}")
        # Fallback to basic evaluation
        return _fallback_evaluation(result)


async def quick_evaluate(
    exploit_type: str,
    result: ExecResult,
) -> dict[str, Any]:
    """
    Fast synchronous evaluation without LLM - for cases where speed matters.
    Uses pattern matching to detect common error types.
    """
    logger.info(f"Critic: Quick evaluating {exploit_type} result")
    
    combined_output = (result.stdout or "") + (result.stderr or "")
    
    # Check for success patterns
    success_patterns = {
        "sqli": [r"admin", r"true", r"authenticated", r"login success", r"bypass"],
        "xss": [r"<script", r"alert(", r"onerror=", r"javascript:"],
        "auth_bypass": [r"admin", r"dashboard", r"privilege", r"access granted"],
        "idor": [r'"id":', r'"email":', r'"password":', r'"address":'],
    }
    
    if exploit_type in success_patterns:
        for pattern in success_patterns[exploit_type]:
            if re.search(pattern, combined_output, re.IGNORECASE):
                return {
                    "success": True,
                    "evidence": f"Pattern '{pattern}' found in response",
                    "error_type": "none",
                    "feedback": "Exploit appears successful - pattern match found",
                    "severity": "high",
                    "session_token_found": False,
                    "session_token_value": None,
                }
    
    # Auto-detect error type
    error_type = _auto_detect_error_type(result)
    
    return {
        "success": False,
        "evidence": combined_output[:500],
        "error_type": error_type,
        "feedback": f"Quick evaluation: detected {error_type} - needs LLM review",
        "severity": "medium" if error_type != "none" else "low",
        "session_token_found": False,
        "session_token_value": None,
    }


def _auto_detect_error_type(result: ExecResult) -> str:
    """Automatically detect error type from stdout/stderr using pattern matching."""
    combined = (result.stdout or "") + (result.stderr or "")
    combined_lower = combined.lower()
    
    for error_type, patterns in ERROR_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, combined, re.IGNORECASE):
                logger.info(f"Critic: Auto-detected error type: {error_type}")
                return error_type
    
    # Check exit code
    if result.exit_code != 0:
        return "unknown"  # Non-zero exit but unknown error type
    
    return "none"


def _parse_critic_response(response: str) -> dict[str, Any]:
    """Parse JSON from Critic LLM response."""
    import re as regex_module
    
    # Clean the response - remove markdown code blocks
    cleaned = response.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)
    
    # Try to extract JSON
    try:
        # Look for JSON object
        json_match = regex_module.search(r'\{[^{}]*\}', cleaned, regex_module.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except json.JSONDecodeError:
        pass
    
    # Fallback: try parsing entire response
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.warning(f"Critic: Failed to parse JSON response: {e}")
        raise


def _fallback_evaluation(result: ExecResult) -> dict[str, Any]:
    """Fallback evaluation when LLM fails."""
    error_type = _auto_detect_error_type(result)
    combined = (result.stdout or "") + (result.stderr or "")
    
    return {
        "success": False,
        "evidence": combined[:500],
        "error_type": error_type,
        "feedback": "Critic evaluation failed - using fallback analysis",
        "severity": "medium",
        "session_token_found": False,
        "session_token_value": None,
    }


def extract_session_tokens(result: ExecResult) -> dict[str, str]:
    """
    Extract potential session tokens, cookies, or auth headers from response.
    Returns dict of {token_name: token_value}
    """
    tokens = {}
    combined = (result.stdout or "") + (result.stderr or "")
    
    # Common session/token patterns
    patterns = [
        (r'session[_-]?id["\s:=]+([^\s",}]+)', "session_id"),
        (r'token["\s:=]+([^\s",}]+)', "token"),
        (r'Authorization:\s*([^\s]+)', "authorization"),
        (r'Bearer\s+([^\s]+)', "bearer_token"),
        (r'Set-Cookie:\s*([^=]+)=([^;]+)', "cookie"),
        (r'jwt["\s:=]+([^\s",}]+)', "jwt"),
    ]
    
    for pattern, name in patterns:
        match = re.search(pattern, combined, re.IGNORECASE)
        if match:
            tokens[name] = match.group(1)
    
    return tokens
