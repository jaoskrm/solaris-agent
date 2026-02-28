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

from core.llm_client import llm_client
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
        r"TypeError:",
        r"AttributeError:",
    ],
    "waf_block": [
        r"403 Forbidden",
        r"WAF",
        r"ModSecurity",
        r"blocked",
        r"detected malicious",
        r"Request blocked",
    ],
    "auth_failure": [
        r"401 Unauthorized",
        r"403 Forbidden",
        r"Invalid credentials",
        r"login failed",
        r"Session expired",
        r"No Authorization header",
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
        r"Unexpected path",
    ],
    "rate_limit": [
        r"429 Too Many Requests",
        r"rate limit",
        r"too many requests",
    ],
    "server_error": [
        r"500 Internal Server Error",
        r"500",
        r"502 Bad Gateway",
        r"503 Service Unavailable",
        r"504 Gateway Timeout",
        r"Internal Server Error",
    ],
}


# ============ JUICE SHOP SPECIFIC PATTERNS ============
JUICE_SHOP_PATTERNS = {
    "sequelize": [r"Sequelize", r"sequelize", r"SQLITE", r"sqlite"],
    "express": [r"Express", r"express", r"Node.js"],
    "jwt": [r"jwt", r"JWT", r"JsonWebToken"],
    "angular": [r"Angular", r"angular"],
    "sql_syntax_error": [
        r"SQLITE_CANTOPEN",
        r"SQL syntax",
        r"near .* syntax error",
        r"unrecognized token",
    ],
    "validation_error": [
        r"Validation error",
        r"isValidationError",
    ],
    "jwt_error": [
        r"invalid token",
        r"TokenExpiredError",
        r"jwt expired",
        r"Unexpected token",
        r"JsonWebTokenError",
    ],
    "access_denied": [
        r"Access Denied",
        r"Access to.* is denied",
    ],
}


def _scan_for_juice_shop_hints(result):
    """Pre-scan result for Juice Shop specific patterns."""
    combined = (result.stdout or "") + (result.stderr or "")
    detected = {}
    for category, patterns in JUICE_SHOP_PATTERNS.items():
        matches = []
        for pattern in patterns:
            match = re.search(pattern, combined, re.IGNORECASE)
            if match:
                matches.append(match.group(0))
        if matches:
            detected[category] = matches
    return detected


def _build_grounded_feedback(hints, exploit_type):
    """Build specific feedback based on detected technologies."""
    feedback_parts = []
    if "sequelize" in hints or "sql_syntax_error" in hints:
        feedback_parts.append(
            "DETECTED: Server uses SQLite via Sequelize. Avoid standard MySQL comments (--). Use SQLite-safe syntax."
        )
    if "jwt_error" in hints:
        feedback_parts.append(
            "DETECTED: JWT authentication issue. Try generating a fresh token via SQLi."
        )
    if "validation_error" in hints:
        feedback_parts.append("DETECTED: Input validation error. Try encoding differently.")
    if "access_denied" in hints:
        feedback_parts.append("DETECTED: Access denied. Try with valid session token.")
    return " ".join(feedback_parts) if feedback_parts else ""


CRITIC_SYSTEM_PROMPT = """You are the Critic — a meticulous security analyst who evaluates exploit attempts.
Your role is to provide STRUCTURED, ACTIONABLE feedback to the exploit specialist.

OUTPUT FORMAT: You MUST respond ONLY in valid JSON with this exact structure:

{{
  "success": true|false,
  "evidence": "The specific data that proves success or failure (max 500 chars)",
  "error_type": "none|syntax_error|waf_block|auth_failure|timeout|not_found|rate_limit|server_error|unknown",
  "feedback": "Specific, actionable advice for the exploit specialist on how to fix the failure. 
               If success=true, briefly confirm what worked.",
  "severity": "critical|high|medium|low|none",
  "session_token_found": true|false,
  "session_token_value": "if session_token_found=true, extract the token value",
  "recommendation": "stealthier|pivot|retry|abort - strategic recommendation for Commander"
}}

SUCCESS CRITERIA:
- SQLi: Boolean-based true/false in response, UNION works, SQLite/Sequelize errors (shows query execution), or authentication bypassed
- XSS: Script tags in response, alert() references, payload stored/reflected, DOM manipulation, OR HTTP 200/201 with success JSON (stored XSS)
- Stored XSS: Product created successfully, review posted, or HTTP 200/201 with confirmation
- Reflected/DOM XSS: Payload appears unescaped in response, URL fragment manipulation works
- Auth Bypass: Access to admin panel, elevated privileges, JWT token in response, or unauthorized data access
- Access Control: Bypass restrictions, access admin-only endpoints, or modify other users' data
- IDOR: Access to other users' data, different user IDs in responses, or data enumeration
- Data Exposure: JSON arrays/objects returned, database fields visible, or sensitive info leaked
- XXE: File contents retrieved (/etc/passwd, system files), error messages showing file system
- File Upload: Success message, file path returned, or upload confirmation
- SSTI: Template expressions evaluated ({{7*7}} returning 49), math operations executed
- Command Injection: Command executed, system output returned, or shell access achieved
- LFI/RFI: Local files retrieved, PHP filters working, or directory traversal successful

JUICESHOP-SPECIFIC SUCCESS INDICATORS:
- SQLi: SQLite errors mean the query executed - that's success for error-based SQLi
- XSS: 200/201 response with JSON confirmation means payload was stored
- Data Exposure: Products API returns full database records with all fields

FAILURE ANALYSIS:
- syntax_error: Python/curl syntax is wrong — fix syntax before changing exploit logic
- waf_block: WAF detected the payload — try encoding, obfuscation, or different vectors
- auth_failure: Authentication/authorization failed — try different credentials or sessions
- timeout: Target not responding — try slower timing attacks or different endpoints
- not_found: Endpoint doesn't exist — verify path from recon or try alternatives
- rate_limit: Too many requests — slow down or use different IPs
- server_error: 500/502/503/504 errors — payload is TOO LOUD, recommend STEALTHIER approach

STEALTH RECOMMENDATIONS (Use when server_error or waf_block detected):
1. Use curl with custom headers: -H "X-Forwarded-For: 127.0.0.1" -H "User-Agent: Mozilla/5.0"
2. URL encode payloads: %27 instead of ', %22 instead of ", etc.
3. Use double URL encoding for WAF evasion: %2527 instead of %27
4. Add delays between requests: --connect-timeout 30
5. Use POST instead of GET for payload delivery
6. Split payloads across multiple parameters
7. Use comment obfuscation: /**/ between SQL keywords
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
    
    # ========== INTELLIGENCE UPGRADE: Pre-scan for specific patterns ==========
    # This grounds the LLM's reasoning in actual detected technologies
    juice_shop_hints = _scan_for_juice_shop_hints(result)
    grounded_feedback = _build_grounded_feedback(juice_shop_hints, exploit_type)
    
    logger.info(f"Critic: Detected hints: {juice_shop_hints}")
    
    # Build context for the Critic
    intel_str = json.dumps(intel, indent=2, default=str) if intel else "(no intelligence available)"
    prev_str = json.dumps(previous_attempts, indent=2, default=str) if previous_attempts else "(no previous attempts)"
    
    # Build the analysis prompt with grounded feedback
    hints_section = f"\n\nGROUNDED INTELLIGENCE:\n{grounded_feedback}" if grounded_feedback else ""
    
    analysis_prompt = CRITIC_ANALYSIS_PROMPT.format(
        exploit_type=exploit_type,
        tool_name=tool_name,
        command=command[:500],  # Truncate long commands
        exit_code=result.exit_code,
        stdout=result.stdout[:3000] if result.stdout else "(empty)",
        stderr=result.stderr[:1000] if result.stderr else "(empty)",
        intel=intel_str,
        previous_attempts=prev_str,
    ) + hints_section
    
    # Call the Critic LLM
    try:
        response = await llm_client.chat(
            model=settings.critic_model,  # Use Critic-specific model
            messages=[
                {"role": "system", "content": CRITIC_SYSTEM_PROMPT},
                {"role": "user", "content": analysis_prompt},
            ],
            temperature=0.1,  # Low temperature for consistent evaluation
            fallback_model=settings.critic_model_fallback,
        )
        
        evaluation = _parse_critic_response(response)
        
        # Also run automatic error detection as backup
        if evaluation.get("error_type") == "unknown":
            auto_detected = _auto_detect_error_type(result)
            if auto_detected != "none":
                evaluation["error_type"] = auto_detected
                evaluation["feedback"] = f"Auto-detected {auto_detected}. {evaluation.get('feedback', '')}"
        
        # Add recommendation if not present
        if "recommendation" not in evaluation:
            evaluation["recommendation"] = _generate_stealth_recommendation(evaluation.get("error_type", "unknown"))
        
        # Enhance feedback for server errors with specific stealth guidance
        if evaluation.get("error_type") == "server_error":
            evaluation["feedback"] = (
                "🚨 TOO LOUD - 500 Internal Server Error detected! "
                "The payload crashed the server. SWITCH TO STEALTH MODE: "
                "1) Use curl with custom headers (-H 'X-Forwarded-For: 127.0.0.1'), "
                "2) URL encode payloads (%27 instead of '), "
                "3) Add delays between requests, "
                "4) Try POST instead of GET. "
                + evaluation.get("feedback", "")
            )
            evaluation["severity"] = "high"
        
        logger.info(f"Critic: Evaluation complete - success={evaluation.get('success')}, error_type={evaluation.get('error_type')}, recommendation={evaluation.get('recommendation')}")
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
    
    # Check for success patterns - enhanced for Juice Shop and real-world apps
    success_patterns = {
        "sqli": [r"admin", r"true", r"authenticated", r"login success", r"bypass", r"sqlite", r"mysql", r"union select", r"version\(\)"],
        "xss": [r"<script", r"alert\s*\(", r"onerror\s*=", r"javascript\s*:", r"onload\s*=", r"onmouseover\s*="],
        "dom_xss": [r"#\s*", r"location\.", r"document\.", r"innerHTML", r"eval\s*\("],
        "stored_xss": [r"created", r"success", r"posted", r"review", r"comment"],
        "reflected_xss": [r"search", r"query", r"keyword", r"results"],
        "auth_bypass": [r"admin", r"dashboard", r"privilege", r"access granted", r"welcome", r"profile", r"account"],
        "access_control": [r"unauthorized", r"forbidden", r"403", r"access denied"],
        "idor": [r'"id":', r'"email":', r'"password":', r'"address":', r'"user":', r'"data":', r'"content":'],
        "data_exposure": [r'"id":', r'"name":', r'"email":', r'"price":', r'"description":', r'"data":', r'\[\s*\{', r'json', r'"rating"'],
        "xxe": [r"etc/passwd", r"passwd", r"root:", r"xml", r"entity"],
        "file_upload": [r"upload", r"success", r"file", r"created", r"path"],
        "ssti": [r"49", r"7\*7", r"48", r"template", r"render"],
        "nosql": [r"true", r"admin", r"[$]ne", r"[$]gt", r"[$]regex"],
        "lfi": [r"etc/passwd", r"passwd", r"root:", r"\.\./", r"%2e%2e", r"php://filter"],
        "rce": [r"uid=", r"root", r"whoami", r"id\s*", r"command", r"output"],
        "csrf": [r"token", r"success", r"changed", r"updated"],
        "command_injection": [r"uid=", r"root", r"bin/", r"etc/"],
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


def _generate_stealth_recommendation(error_type: str) -> str:
    """Generate strategic recommendation based on error type."""
    if error_type == "server_error":
        return "stealthier"  # 500 errors mean we're too loud
    elif error_type == "waf_block":
        return "stealthier"  # WAF detected us
    elif error_type == "rate_limit":
        return "stealthier"  # Being rate limited
    elif error_type == "not_found":
        return "pivot"  # Try different endpoint
    elif error_type == "auth_failure":
        return "retry"  # Try different credentials
    else:
        return "retry"


def _fallback_evaluation(result: ExecResult) -> dict[str, Any]:
    """Fallback evaluation when LLM fails - with intelligent success detection."""
    error_type = _auto_detect_error_type(result)
    combined = (result.stdout or "") + (result.stderr or "")
    combined_lower = combined.lower()
    
    # Enhanced success detection for various exploit types
    # HTTP Success indicators
    http_success = re.search(r'HTTP/[\d.]+\s+(200|201|202|204)', combined)
    json_response = re.search(r'\{\s*"[^"]+"\s*:', combined)
    
    # Check for data exposure (JSON arrays/objects with data)
    data_exposure_indicators = [
        r'"id"\s*:\s*\d+',
        r'"name"\s*:',
        r'"email"\s*:',
        r'"data"\s*:\s*\[',
        r'\[\s*\{.*\}',
    ]
    
    for pattern in data_exposure_indicators:
        if re.search(pattern, combined):
            return {
                "success": True,
                "evidence": f"Data exposure detected: {combined[:200]}",
                "error_type": "none",
                "feedback": "Exploit successful - data retrieved from target",
                "severity": "high",
                "session_token_found": False,
                "session_token_value": None,
                "recommendation": "none",
            }
    
    # Check for XSS indicators (script tags, event handlers, etc.)
    xss_indicators = [
        r'<script',
        r'<img[^>]+onerror',
        r'<iframe[^>]+onload',
        r'on\w+\s*=',
        r'javascript:',
    ]
    
    for pattern in xss_indicators:
        if re.search(pattern, combined, re.IGNORECASE):
            return {
                "success": True,
                "evidence": f"XSS payload present in response: {pattern}",
                "error_type": "none",
                "feedback": "XSS exploit appears successful - payload present in response",
                "severity": "high",
                "session_token_found": False,
                "session_token_value": None,
                "recommendation": "none",
            }
    
    # Check for authentication/session indicators
    auth_indicators = [
        r'"token"\s*:',
        r'authorization',
        r'session',
        r'welcome',
        r'admin',
    ]
    
    for pattern in auth_indicators:
        if re.search(pattern, combined_lower):
            return {
                "success": True,
                "evidence": f"Auth indicator found: {pattern}",
                "error_type": "none",
                "feedback": "Authentication bypass or session obtained",
                "severity": "critical",
                "session_token_found": True,
                "session_token_value": None,
                "recommendation": "none",
            }
    
    # Check for SQL injection errors (which means query executed)
    sqli_indicators = [
        r'sqlite',
        r'sequelize',
        r'sql syntax',
        r'near.*syntax error',
        r'unrecognized token',
    ]
    
    for pattern in sqli_indicators:
        if re.search(pattern, combined_lower):
            return {
                "success": True,
                "evidence": f"SQL error indicates query execution: {combined[:200]}",
                "error_type": "none",
                "feedback": "SQL injection successful - database error confirms query execution",
                "severity": "critical",
                "session_token_found": False,
                "session_token_value": None,
                "recommendation": "none",
            }
    
    # Build feedback based on error type
    if error_type == "server_error":
        feedback = "CRITICAL: 500 Internal Server Error detected. Payload is TOO LOUD and crashed the server. RECOMMENDATION: Switch to STEALTH MODE - use curl with custom headers, URL encoding, and slower timing."
    elif error_type == "waf_block":
        feedback = "WAF detected the payload. Try URL encoding, different headers, or parameter obfuscation."
    else:
        feedback = "Critic evaluation failed - using fallback analysis"
    
    return {
        "success": False,
        "evidence": combined[:500],
        "error_type": error_type,
        "feedback": feedback,
        "severity": "high" if error_type == "server_error" else "medium",
        "session_token_found": False,
        "session_token_value": None,
        "recommendation": _generate_stealth_recommendation(error_type),
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
