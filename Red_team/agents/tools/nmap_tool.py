"""
Nmap tool — port scanning and service detection via sandbox.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from agents.tools.registry import ToolSpec
from sandbox.sandbox_manager import shared_sandbox_manager, ExecResult

logger = logging.getLogger(__name__)


def _sanitize_nmap_args(args: str, port_args: str) -> str:
    """
    Sanitize nmap arguments to prevent duplicate flags and conflicting options.
    
    Args:
        args: User-provided args
        port_args: System-generated port args
        
    Returns:
        Cleaned argument string
    """
    if not args:
        return port_args
    
    # Extract port specification from port_args (e.g., "-p 3000")
    port_match = re.search(r'-p\s+\S+', port_args)
    system_port = port_match.group(0) if port_match else ""
    
    # Remove any duplicate -p flags from user args
    args_cleaned = re.sub(r'-p\s+\S+', '', args)
    
    # Remove duplicate flag categories
    flags_to_dedup = ['-sV', '-sC', '-sS', '-sT', '-sU', '-A', '-O']
    for flag in flags_to_dedup:
        # Count occurrences
        occurrences = len(re.findall(re.escape(flag) + r'\b', args_cleaned))
        if occurrences > 1:
            # Keep only the first occurrence
            parts = args_cleaned.split(flag)
            if len(parts) > 2:
                args_cleaned = flag.join([parts[0]] + parts[2:])
    
    # Build final args: system port args take precedence
    if system_port and '-p' not in args_cleaned:
        final_args = f"{system_port} {port_args.replace(system_port, '').strip()} {args_cleaned.strip()}"
    else:
        final_args = f"{port_args} {args_cleaned.strip()}"
    
    return ' '.join(final_args.split())  # Normalize whitespace


async def nmap_execute(mission_id: str, target: str, args: str = "") -> ExecResult:
    """
    Run nmap scan against a target.

    Args:
        mission_id: Active mission ID
        target: Target URL or host/IP to scan (e.g., http://localhost:3000)
        args: Additional nmap arguments (optional)
    """
    # With shared sandbox using host network, localhost is directly accessible
    host = "localhost"
    
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
    
    # Sanitize arguments to prevent duplicates
    final_args = _sanitize_nmap_args(args, port_args)
    
    command = f"nmap {final_args} {scan_target}"
    logger.info(f"Precision nmap: {command}")
    return await shared_sandbox_manager.exec_command(command, timeout=60)


nmap_tool = ToolSpec(
    name="nmap",
    description="Port scanning and service detection. For URLs like http://localhost:3000, automatically scans ONLY that specific port for efficiency.",
    args_schema={
        "target": "Target URL (e.g., http://localhost:3000) or host/IP to scan",
        "args": "Optional additional nmap flags",
    },
    execute=nmap_execute,
)
