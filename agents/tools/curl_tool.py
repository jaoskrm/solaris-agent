"""
HTTP request tool — curl wrapper for crafting custom requests via sandbox.
"""

from __future__ import annotations

import logging
import shlex

from agents.tools.registry import ToolSpec
from sandbox.sandbox_manager import sandbox_manager, ExecResult

logger = logging.getLogger(__name__)


async def curl_execute(
    mission_id: str,
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    data: str = "",
    args: str = "",
) -> ExecResult:
    """
    Send an HTTP request via curl.

    Args:
        mission_id: Active mission ID
        url: Target URL
        method: HTTP method (GET, POST, PUT, DELETE)
        headers: Optional dict of headers
        data: Optional request body
        args: Additional curl arguments
    """
    # Resolve Docker service name
    host = sandbox_manager.get_target_host()
    docker_url = url.replace("localhost:3000", f"{host}:3000").replace("localhost", host)

    parts = ["curl", "-s", "-i", f"-X {method}"]

    if headers:
        for key, value in headers.items():
            parts.append(f'-H {shlex.quote(f"{key}: {value}")}')

    if data:
        parts.append(f"-d {shlex.quote(data)}")

    if args:
        parts.append(args)

    parts.append(shlex.quote(docker_url))

    command = " ".join(parts)
    return await sandbox_manager.exec_command(mission_id, command, timeout=30)


curl_tool = ToolSpec(
    name="curl",
    description="Send custom HTTP requests. Supports all methods, custom headers, JSON bodies, and cookies. Returns full response including headers.",
    args_schema={
        "url": "Target URL (e.g. http://localhost:3000/rest/user/login)",
        "method": "HTTP method: GET, POST, PUT, DELETE (default: GET)",
        "headers": "Optional dict of headers (e.g. {'Content-Type': 'application/json'})",
        "data": "Optional request body (e.g. JSON payload)",
        "args": "Optional: additional curl flags (e.g. -L for follow redirects)",
    },
    execute=curl_execute,
)
