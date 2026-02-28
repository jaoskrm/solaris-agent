"""
Nuclei tool — vulnerability scanning with templates via sandbox.

Maps common vulnerability categories to real Nuclei template paths
and executes scans with rate limiting to prevent OOM.
"""

from __future__ import annotations

import logging

from agents.tools.registry import ToolSpec
from sandbox.sandbox_manager import sandbox_manager, ExecResult

logger = logging.getLogger(__name__)

# Map common vulnerability names to real Nuclei template directories/tags
TEMPLATE_MAP = {
    # SQL injection
    "sql-injection": "dast/vulnerabilities/sqli/",
    "sqli": "dast/vulnerabilities/sqli/",
    "sql": "dast/vulnerabilities/sqli/",
    # XSS
    "xss": "dast/vulnerabilities/xss/",
    "cross-site-scripting": "dast/vulnerabilities/xss/",
    # SSRF
    "ssrf": "dast/vulnerabilities/ssrf/",
    # LFI / RFI / Path traversal
    "lfi": "dast/vulnerabilities/lfi/",
    "rfi": "dast/vulnerabilities/rfi/",
    "path-traversal": "dast/vulnerabilities/lfi/",
    # Open redirect
    "open-redirect": "dast/vulnerabilities/redirect/",
    "redirect": "dast/vulnerabilities/redirect/",
    # Command injection
    "cmdi": "dast/vulnerabilities/cmdi/",
    "command-injection": "dast/vulnerabilities/cmdi/",
    "rce": "dast/vulnerabilities/cmdi/",
    # Auth / default creds
    "default-creds": "http/default-logins/",
    "default-logins": "http/default-logins/",
    # CVEs
    "cves": "http/cves/",
    "cve": "http/cves/",
    # Misconfigurations
    "misconfig": "http/misconfiguration/",
    "misconfiguration": "http/misconfiguration/",
    # Exposed panels
    "panels": "http/exposed-panels/",
    "exposed-panels": "http/exposed-panels/",
    # Technologies
    "tech": "http/technologies/",
    "technologies": "http/technologies/",
    # Full DAST scan (lighter than all templates)
    "dast": "dast/",
    # Web-focused scan
    "web": "http/",
}


async def nuclei_execute(
    mission_id: str,
    target: str,
    templates: str = "",
    severity: str = "critical,high,medium",
    args: str = "",
    headers: dict = {},
) -> ExecResult:
    """
    Run Nuclei vulnerability scanner against a target.

    Args:
        mission_id: Active mission ID
        target: Target URL to scan
        templates: Vulnerability categories (e.g. 'sqli', 'xss', 'cves') or template paths
        severity: Severity filter (default: critical,high,medium)
        args: Additional nuclei arguments
        headers: Optional HTTP headers dict (e.g. {"Cookie": "session=xxx"})
    """
    # Resolve Docker service name
    host = sandbox_manager.get_target_host()
    docker_target = target.replace("localhost:3000", f"{host}:3000").replace("localhost", host)

    parts = [
        "nuclei",
        f"-u {docker_target}",
        f"-severity {severity}",
        "-json-export /tmp/nuclei-results.json",
        "-rl 50",          # Rate limit: 50 req/sec to reduce memory pressure
        "-c 10",           # Concurrency: 10 templates at a time
        "-bs 25",          # Bulk size: max 25 templates loaded at once (prevents OOM)
        "-timeout 10",     # Per-request timeout
        "-stats",          # Show progress
    ]

    if templates:
        # Resolve template categories to real paths
        resolved = _resolve_templates(templates)
        parts.append(f"-t {resolved}")
    else:
        # Default: minimal targeted scan for Juice Shop (Node.js/Express)
        # Avoid loading hundreds of templates that cause OOM
        parts.append("-t http/exposed-panels/ -t http/misconfiguration/")

    # Add custom headers if provided
    if headers:
        for key, value in headers.items():
            # Escape double quotes in header value
            escaped_value = value.replace('"', '\\"')
            parts.append(f'-H "{key}: {escaped_value}"')

    if args:
        parts.append(args)

    command = " ".join(parts)
    result = await sandbox_manager.exec_command(mission_id, command, timeout=180)

    # Also grab the JSON results if available
    json_result = await sandbox_manager.exec_command(
        mission_id, "cat /tmp/nuclei-results.json 2>/dev/null || echo '[]'", timeout=10
    )
    if json_result.stdout and json_result.stdout.strip() != "[]":
        result.stdout = result.stdout + "\n\n--- JSON Results ---\n" + json_result.stdout

    return result


def _resolve_templates(templates_str: str) -> str:
    """
    Resolve template category names to real Nuclei template paths.
    Input: 'sqli, xss, cves'  →  Output: 'dast/vulnerabilities/sqli/ -t dast/vulnerabilities/xss/ -t http/cves/'
    """
    parts = [t.strip().lower() for t in templates_str.split(",")]
    resolved = []
    for part in parts:
        if part in TEMPLATE_MAP:
            resolved.append(TEMPLATE_MAP[part])
        else:
            # Pass through as-is (might be a real path)
            resolved.append(part)

    # Join with -t flags
    return " -t ".join(resolved)


nuclei_tool = ToolSpec(
    name="nuclei",
    description=(
        "Vulnerability scanner using community templates. Detects known CVEs, "
        "misconfigurations, exposed panels, default credentials, SQL injection, XSS, and more. "
        "Use template categories: 'sqli', 'xss', 'cves', 'default-creds', 'misconfig', 'panels', "
        "'ssrf', 'lfi', 'rce', 'tech'. Multiple categories can be comma-separated."
    ),
    args_schema={
        "target": "Full target URL (e.g. http://localhost:3000)",
        "templates": "Vulnerability categories: sqli, xss, cves, default-creds, misconfig, panels, lfi, rce, ssrf, tech. Comma-separated.",
        "severity": "Optional: severity filter (default: critical,high,medium)",
        "args": "Optional: additional nuclei flags",
        "headers": "Optional: HTTP headers as dict (e.g. {\"Cookie\": \"session=xxx\"})",
    },
    execute=nuclei_execute,
)
