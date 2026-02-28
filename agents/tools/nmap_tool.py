"""
Nmap tool — port scanning and service detection via sandbox.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from agents.tools.registry import ToolSpec
from sandbox.sandbox_manager import sandbox_manager, ExecResult

logger = logging.getLogger(__name__)


async def nmap_execute(mission_id: str, target: str, args: str = "") -> ExecResult:
    """
    Run nmap scan against a target.

    Args:
        mission_id: Active mission ID
        target: Target URL or host/IP to scan (e.g., http://localhost:3000)
        args: Additional nmap arguments (optional)
    """
    # Resolve Docker service names based on network mode
    host = sandbox_manager.get_target_host()
    
    # Parse target URL to extract host and port
    original_target = target
    if "://" in target:
        # It's a URL - extract host and port
        parsed = urlparse(target)
        target_host = parsed.hostname or host
        target_port = parsed.port
        
        # Replace localhost with docker host
        if target_host in ("localhost", "127.0.0.1"):
            target_host = host
            
        # Build scan target with specific port
        if target_port:
            scan_target = f"{target_host}"
            # Use -p to scan only the specific port
            port_args = f"-p {target_port} -sV -sC"
        else:
            scan_target = f"{target_host}"
            port_args = "-sV -sC"
    else:
        # It's just a host/IP
        target_host = target.replace("localhost", host).replace("127.0.0.1", host)
        scan_target = target_host
        port_args = "-sV -sC"
    
    # Merge user-provided args with our precision args
    final_args = f"{port_args} {args}".strip()
    
    command = f"nmap {final_args} {scan_target}"
    logger.info(f"Precision nmap: {command}")
    return await sandbox_manager.exec_command(mission_id, command, timeout=60)


nmap_tool = ToolSpec(
    name="nmap",
    description="Port scanning and service detection. For URLs like http://localhost:3000, automatically scans ONLY that specific port for efficiency.",
    args_schema={
        "target": "Target URL (e.g., http://localhost:3000) or host/IP to scan",
        "args": "Optional additional nmap flags",
    },
    execute=nmap_execute,
)
