"""
Python execution tool — run Python exploit scripts in the sandbox.
"""

from __future__ import annotations

import logging

from agents.tools.registry import ToolSpec
from sandbox.sandbox_manager import sandbox_manager, ExecResult

logger = logging.getLogger(__name__)


async def python_exec_execute(
    mission_id: str,
    code: str,
    timeout: int = 30,
) -> ExecResult:
    """
    Execute a Python script inside the sandbox.

    Args:
        mission_id: Active mission ID
        code: Python code to execute
        timeout: Execution timeout in seconds
    """
    # Replace localhost references based on network mode
    host = sandbox_manager.get_target_host()
    code = code.replace("localhost:3000", f"{host}:3000")

    # Write code to temp file and execute
    # Using heredoc to avoid quoting issues
    escaped_code = code.replace("'", "'\\''")
    command = f"python3 -c '{escaped_code}'"

    return await sandbox_manager.exec_command(mission_id, command, timeout=timeout)


python_exec_tool = ToolSpec(
    name="python",
    description="Execute Python code in an isolated sandbox. Has access to 'requests' library for HTTP. Use this for complex exploit logic, automated attacks, or data processing.",
    args_schema={
        "code": "Python code to execute (has 'requests' available)",
        "timeout": "Optional: execution timeout in seconds (default: 30)",
    },
    execute=python_exec_execute,
)
