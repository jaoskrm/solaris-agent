"""
Nmap tool — port scanning and service detection via sandbox.
"""

from __future__ import annotations

import logging

from agents.tools.registry import ToolSpec
from sandbox.sandbox_manager import sandbox_manager, ExecResult

logger = logging.getLogger(__name__)


async def nmap_execute(mission_id: str, target: str, args: str = "-sV -sC --top-ports 100") -> ExecResult:
    """
    Run nmap scan against a target.

    Args:
        mission_id: Active mission ID
        target: Target host/IP to scan
        args: Additional nmap arguments (default: service detection + top 100 ports)
    """
    # Resolve Docker service names based on network mode
    host = sandbox_manager.get_target_host()
    docker_target = target.replace("http://localhost:3000", host).replace("localhost", host)
    if "://" in docker_target:
        # Strip protocol for nmap
        docker_target = docker_target.split("://")[1].split("/")[0].split(":")[0]

    command = f"nmap {args} {docker_target}"
    return await sandbox_manager.exec_command(mission_id, command, timeout=120)


nmap_tool = ToolSpec(
    name="nmap",
    description="Port scanning and service detection. Discovers open ports, running services, and OS information.",
    args_schema={
        "target": "Target host or IP to scan",
        "args": "Optional nmap flags (default: -sV -sC --top-ports 100)",
    },
    execute=nmap_execute,
)
