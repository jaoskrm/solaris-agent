"""
Sandbox Manager — Docker container lifecycle for isolated tool execution.

Creates a lightweight sandbox container on the same Docker network as
Juice Shop, allowing agents to run tools (nmap, nuclei, curl, python)
in isolation.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import docker
from docker.errors import NotFound, APIError

logger = logging.getLogger(__name__)

SANDBOX_IMAGE = "vibecheck-sandbox:latest"
SANDBOX_DOCKERFILE = Path(__file__).parent / "Dockerfile.sandbox"
NETWORK_NAME = "red_team_redteam_net"  # Docker Compose prefixes with project name


@dataclass
class ExecResult:
    """Result of a command execution inside the sandbox."""

    exit_code: int
    stdout: str
    stderr: str
    command: str
    timed_out: bool = False

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and not self.timed_out

    def __str__(self) -> str:
        status = "OK" if self.success else f"FAIL (exit={self.exit_code})"
        output = self.stdout[:500] if self.stdout else self.stderr[:500]
        return f"[{status}] {self.command}\n{output}"


class SandboxManager:
    """Manages Docker sandbox containers for tool execution."""

    def __init__(self):
        self._client: docker.DockerClient | None = None
        self._containers: dict[str, Any] = {}  # mission_id -> container
        self.use_host_network: bool = False  # Track networking mode

    def _get_client(self) -> docker.DockerClient:
        if self._client is None:
            self._client = docker.from_env()
        return self._client

    def get_target_host(self) -> str:
        """Return the correct hostname for Juice Shop based on network mode."""
        return "localhost" if self.use_host_network else "juiceshop"

    async def ensure_image(self) -> None:
        """Build the sandbox image if it doesn't exist."""
        client = self._get_client()
        try:
            client.images.get(SANDBOX_IMAGE)
            logger.info("Sandbox image '%s' already exists", SANDBOX_IMAGE)
        except NotFound:
            logger.info("Building sandbox image '%s'...", SANDBOX_IMAGE)
            await asyncio.to_thread(
                client.images.build,
                path=str(SANDBOX_DOCKERFILE.parent),
                dockerfile=SANDBOX_DOCKERFILE.name,
                tag=SANDBOX_IMAGE,
                rm=True,
            )
            logger.info("Sandbox image built successfully")

    async def create_sandbox(self, mission_id: str) -> str:
        """
        Create and start a sandbox container for a mission.
        Tries compose network first, falls back to host networking.
        Returns the container ID.
        """
        client = self._get_client()
        container_name = f"redteam-sandbox-{mission_id}"

        # Clean up any existing container with same name
        try:
            old = client.containers.get(container_name)
            await asyncio.to_thread(old.remove, force=True)
        except NotFound:
            pass

        base_kwargs = dict(
            image=SANDBOX_IMAGE,
            name=container_name,
            detach=True,
            mem_limit="2g",
            cpu_period=100000,
            cpu_quota=50000,
            security_opt=["no-new-privileges"],
            read_only=True,
            tmpfs={"/tmp": "size=100M", "/workspace": "size=100M"},
        )

        # Try 1: compose network (sandbox can reach juiceshop by Docker DNS)
        try:
            container = await asyncio.to_thread(
                client.containers.run, **base_kwargs, network=NETWORK_NAME
            )
            self.use_host_network = False
            logger.info("Sandbox on compose network: %s", NETWORK_NAME)
        except (NotFound, APIError) as e:
            logger.warning("Compose network failed (%s), trying host networking", e)
            # Try 2: host networking (sandbox uses localhost)
            try:
                # Remove failed container if it was created
                try:
                    failed = client.containers.get(container_name)
                    await asyncio.to_thread(failed.remove, force=True)
                except NotFound:
                    pass

                # Host mode doesn't support read_only with tmpfs the same way
                host_kwargs = {**base_kwargs, "network_mode": "host"}
                host_kwargs.pop("read_only", None)
                host_kwargs.pop("tmpfs", None)
                container = await asyncio.to_thread(
                    client.containers.run, **host_kwargs
                )
                self.use_host_network = True
                logger.info("Sandbox on host network")
            except Exception as e2:
                raise RuntimeError(f"Failed to create sandbox: {e2}") from e2

        self._containers[mission_id] = container
        logger.info("Sandbox created: %s (%s)", container_name, container.short_id)
        return container.id

    async def exec_command(
        self,
        mission_id: str,
        command: str,
        timeout: int = 60,
    ) -> ExecResult:
        """
        Execute a command inside the sandbox container.
        Returns ExecResult with stdout, stderr, and exit code.
        """
        container = self._containers.get(mission_id)
        if container is None:
            return ExecResult(
                exit_code=-1,
                stdout="",
                stderr="No sandbox container found for this mission",
                command=command,
            )

        logger.info("Sandbox exec [%s]: %s", mission_id[:8], command[:100])

        try:
            # Run with timeout using asyncio
            exec_result = await asyncio.wait_for(
                asyncio.to_thread(
                    container.exec_run,
                    ["sh", "-c", command],
                    demux=True,  # Separate stdout/stderr
                    workdir="/workspace",
                ),
                timeout=timeout,
            )

            stdout_raw, stderr_raw = exec_result.output
            stdout = (stdout_raw or b"").decode("utf-8", errors="replace")
            stderr = (stderr_raw or b"").decode("utf-8", errors="replace")

            result = ExecResult(
                exit_code=exec_result.exit_code,
                stdout=stdout,
                stderr=stderr,
                command=command,
            )

            level = logging.DEBUG if result.success else logging.WARNING
            logger.log(level, "Sandbox result: %s", str(result)[:200])
            return result

        except asyncio.TimeoutError:
            logger.warning("Sandbox command timed out after %ds: %s", timeout, command[:100])
            return ExecResult(
                exit_code=-1,
                stdout="",
                stderr=f"Command timed out after {timeout}s",
                command=command,
                timed_out=True,
            )
        except Exception as e:
            logger.error("Sandbox exec error: %s", e)
            return ExecResult(
                exit_code=-1,
                stdout="",
                stderr=str(e),
                command=command,
            )

    async def destroy_sandbox(self, mission_id: str) -> None:
        """Stop and remove the sandbox container."""
        container = self._containers.pop(mission_id, None)
        if container is None:
            return

        try:
            await asyncio.to_thread(container.remove, force=True)
            logger.info("Sandbox destroyed for mission %s", mission_id[:8])
        except Exception as e:
            logger.warning("Failed to destroy sandbox: %s", e)

    async def destroy_all(self) -> None:
        """Clean up all sandbox containers."""
        for mission_id in list(self._containers.keys()):
            await self.destroy_sandbox(mission_id)

    async def ping(self) -> bool:
        """Check Docker connectivity."""
        try:
            client = self._get_client()
            await asyncio.to_thread(client.ping)
            return True
        except Exception:
            return False


# Default singleton
sandbox_manager = SandboxManager()
