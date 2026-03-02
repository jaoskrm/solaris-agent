"""
Supabase client for Red Team kill chain event persistence.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

# UUID validation regex pattern
UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)


def is_valid_uuid(value: str | None) -> bool:
    """Check if a string is a valid UUID format.
    
    Args:
        value: The string to validate
        
    Returns:
        True if valid UUID, False otherwise
    """
    if not value or value == "unknown":
        return False
    return bool(UUID_PATTERN.match(value))

# Load environment variables from .env file if present
try:
    from pathlib import Path
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    if key not in os.environ:  # Don't override existing env vars
                        os.environ[key] = value
        logger.debug(f"Loaded .env from {env_path}")
except Exception:
    pass  # Silently fail if .env can't be loaded

# Optional Supabase import - gracefully handle if not installed
try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False
    logger.warning("supabase package not installed - kill chain events will not be persisted")


class RedTeamSupabaseClient:
    """Client for persisting Red Team kill chain events to Supabase."""
    
    def __init__(self, url: str | None = None, key: str | None = None):
        self._url = url
        self._key = key
        self._client: Any = None
        self._enabled = HAS_SUPABASE and url and key
        
        if self._enabled:
            try:
                self._client = create_client(url, key)
                logger.info("Red Team Supabase client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Supabase client: {e}")
                self._enabled = False
    
    def table(self, table_name: str):
        """Access a Supabase table - delegates to underlying client.
        
        This allows the wrapper to be used like the native Supabase client:
            client.table("scan_queue").select("*").execute()
        """
        if not self._enabled or not self._client:
            raise RuntimeError("Supabase client not initialized")
        return self._client.table(table_name)
    
    async def log_kill_chain_event(
        self,
        mission_id: str,
        stage: str,  # recon, exploit, post_exploit, etc.
        agent: str,  # commander, alpha, gamma, critic
        event_type: str,  # tool_execution, vulnerability_found, error, etc.
        details: dict[str, Any],
        target: str | None = None,
        success: bool | None = None,
        human_intervention: bool = False,
    ) -> bool:
        """Log a kill chain event to Supabase."""
        if not self._enabled:
            logger.debug(f"Supabase not enabled - event would be logged: {stage}/{event_type}")
            return False
        
        # Validate mission_id to prevent DB errors from invalid UUID
        if not is_valid_uuid(mission_id):
            logger.warning(f"Skipping kill chain event log - invalid mission_id: {mission_id}")
            return False
        
        # B18: Match swarm_agent_events schema
        event_data = {
            "mission_id": mission_id,
            "agent_name": agent,
            "agent_team": "red",
            "event_type": "action" if success else "error",
            "message": f"{stage}/{event_type}",
            "payload": details,
            "phase": stage,
        }
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self._client.table("swarm_agent_events").insert(event_data).execute()
            )
            logger.debug(f"Logged kill chain event: {stage}/{event_type}")
            return True
        except Exception as e:
            error_str = str(e).lower()
            # Silently ignore 404 errors (table doesn't exist)
            if "404" in error_str or "not found" in error_str:
                logger.debug(f"kill_chain_events table not found (404) - skipping log")
            elif "winerror 10035" in error_str:
                logger.debug(f"Windows socket error on Supabase write - skipping log")
            else:
                logger.error(f"Failed to log kill chain event: {e}")
            return False
    
    async def update_mission_status(
        self,
        mission_id: str,
        status: str,  # running, completed, failed
        progress_pct: int = 0,
        current_stage: str | None = None,
        findings_count: int | None = None,
    ) -> bool:
        """Update mission status in Supabase."""
        if not self._enabled:
            return False
        
        update_data = {
            "status": status,
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self._client.table("swarm_missions")
                .update(update_data)
                .eq("id", mission_id)
                .execute()
            )
            return True
        except Exception as e:
            logger.error(f"Failed to update mission status: {e}")
            return False

    async def update_agent_state(
        self,
        mission_id: str,
        agent_id: str,
        agent_name: str,
        status: str,  # idle, running, complete, error, reviewing
        agent_team: str = "red",
        iteration: int | None = None,
        task: str | None = None,
        recent_logs: list[dict] | None = None,
    ) -> bool:
        """Update or insert agent state in swarm_agent_states table.
        
        Uses upsert to create if not exists, update if exists.
        """
        if not self._enabled:
            return False
        
        if not is_valid_uuid(mission_id):
            logger.debug(f"Skipping agent state update - invalid mission_id: {mission_id}")
            return False
        
        # Build agent state data
        state_data = {
            "mission_id": mission_id,
            "agent_id": agent_id,
            "agent_name": agent_name,
            "agent_team": agent_team,
            "status": status,
            "last_updated": datetime.utcnow().isoformat(),
        }
        
        if iteration is not None:
            state_data["iter"] = str(iteration)
        if task is not None:
            state_data["task"] = task
        if recent_logs is not None:
            state_data["recent_logs"] = recent_logs
        
        try:
            loop = asyncio.get_event_loop()
            # Use upsert to handle both insert and update
            await loop.run_in_executor(
                None,
                lambda: self._client.table("swarm_agent_states")
                .upsert(state_data, on_conflict="mission_id,agent_id")
                .execute()
            )
            logger.debug(f"Updated agent state: {agent_name} ({agent_id}) = {status}")
            return True
        except Exception as e:
            logger.error(f"Failed to update agent state: {e}")
            return False

    # ==================== REAL-TIME REPORTING METHODS ====================
    
    async def create_mission(
        self,
        mission_id: str,
        target: str,
        objective: str | None = None,
        mode: str | None = None,
    ) -> dict[str, Any] | None:
        """Create a new mission record in Supabase.

        Args:
            mission_id: Unique mission identifier
            target: Target URL, GitHub repo, or local path
            objective: Mission objective description
            mode: "live", "static", or None for auto-detection

        Returns the created mission data or None if failed.
        """
        # Auto-detect mode if not provided
        if mode is None:
            from agents.state import detect_target_type
            mode = detect_target_type(target)

        if not self._enabled:
            logger.debug(f"Supabase not enabled - mission {mission_id} would be created")
            return None

        mission_data = {
            "id": mission_id,
            "target": target,
            "status": "running",
            "created_at": datetime.utcnow().isoformat(),
        }
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self._client.table("swarm_missions").insert(mission_data).execute()
            )
            logger.info(f"Created mission record: {mission_id}")
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Failed to create mission: {e}")
            return None
    
    async def complete_mission(
        self,
        mission_id: str,
        status: str = "completed",
    ) -> bool:
        """Mark a mission as completed or failed."""
        if not self._enabled:
            return False
        
        update_data = {
            "status": status,
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self._client.table("swarm_missions")
                .update(update_data)
                .eq("id", mission_id)
                .execute()
            )
            logger.info(f"Mission {mission_id} marked as {status}")
            return True
        except Exception as e:
            logger.error(f"Failed to complete mission: {e}")
            return False
    
    async def log_mission_event(
        self,
        mission_id: str,
        event_type: str,
        payload_json: dict[str, Any],
    ) -> bool:
        """Log a mission event to Supabase (NON-BLOCKING).
        
        This method is designed to be fire-and-forget using asyncio.create_task()
        to avoid blocking the main execution loop.
        """
        if not self._enabled:
            return False
        
        # Validate mission_id to prevent DB errors from invalid UUID
        if not is_valid_uuid(mission_id):
            logger.warning(f"Skipping mission event log - invalid mission_id: {mission_id}")
            return False
        
        # B18: Match swarm_agent_events schema
        event_data = {
            "mission_id": mission_id,
            "agent_name": "commander",
            "agent_team": "red",
            "event_type": event_type,
            "message": f"Mission event: {event_type}",
            "payload": payload_json or {},
        }
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self._client.table("swarm_agent_events").insert(event_data).execute()
            )
            logger.debug(f"Logged mission event: {event_type} for {mission_id}")
            return True
        except Exception as e:
            error_str = str(e).lower()
            # Silently ignore 404 errors (table doesn't exist)
            if "404" in error_str or "not found" in error_str:
                logger.debug(f"mission_events table not found (404) - skipping log")
            elif "winerror 10035" in error_str:
                logger.debug(f"Windows socket error on Supabase write - skipping log")
            else:
                logger.error(f"Failed to log mission event: {e}")
            return False
    
    async def get_mission_events(
        self,
        mission_id: str,
        event_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """Retrieve all events for a mission (for final report generation)."""
        if not self._enabled:
            return []
        
        try:
            loop = asyncio.get_event_loop()
            query = self._client.table("swarm_agent_events").select("*").eq("mission_id", mission_id)
            
            if event_type:
                query = query.eq("event_type", event_type)
            
            result = await loop.run_in_executor(
                None,
                lambda: query.order("timestamp", desc=False).execute()
            )
            return result.data if result.data else []
        except Exception as e:
            logger.error(f"Failed to get mission events: {e}")
            return []
    
    async def upload_report(
        self,
        mission_id: str,
        file_content: bytes,
        file_name: str,
        content_type: str,
    ) -> str | None:
        """Upload a report to Supabase Storage.
        
        Returns the public URL of the uploaded file or None if failed.
        """
        if not self._enabled:
            return None
        
        try:
            loop = asyncio.get_event_loop()
            
            # Upload to vibecheck_reports bucket
            file_path = f"{mission_id}/{file_name}"
            result = await loop.run_in_executor(
                None,
                lambda: self._client.storage
                .from_("vibecheck_reports")
                .upload(file_path, file_content, {"content-type": content_type})
            )
            
            # Get public URL
            public_url = await loop.run_in_executor(
                None,
                lambda: self._client.storage
                .from_("vibecheck_reports")
                .get_public_url(file_path)
            )
            
            logger.info(f"Uploaded report: {file_name} for mission {mission_id}")
            return public_url
        except Exception as e:
            logger.error(f"Failed to upload report: {e}")
            return None


# Singleton instance
_supabase_client: RedTeamSupabaseClient | None = None


def get_supabase_client(url: str | None = None, key: str | None = None) -> RedTeamSupabaseClient:
    """Get or create Supabase client singleton.
    
    If url/key not provided, reads from environment variables:
    - SUPABASE_URL
    - SUPABASE_ANON_KEY
    """
    global _supabase_client
    if _supabase_client is None:
        # Read from environment if not provided
        if url is None:
            url = os.getenv("SUPABASE_URL")
        if key is None:
            key = os.getenv("SUPABASE_ANON_KEY")
        _supabase_client = RedTeamSupabaseClient(url, key)
    return _supabase_client


# Convenience function for non-blocking event logging
def fire_and_forget_log_event(
    mission_id: str,
    event_type: str,
    payload_json: dict[str, Any],
) -> None:
    """Fire-and-forget event logging that won't block the main loop.
    
    Usage: fire_and_forget_log_event(mission_id, "exploit_result", {...})
    """
    # Validate mission_id early to prevent unnecessary task creation
    if not is_valid_uuid(mission_id):
        logger.debug(f"Skipping fire_and_forget log - invalid mission_id: {mission_id}")
        return
    
    try:
        client = get_supabase_client()
        if client._enabled:
            # Create task without awaiting - it runs in background
            asyncio.create_task(
                client.log_mission_event(mission_id, event_type, payload_json)
            )
    except Exception as e:
        logger.debug(f"Failed to queue event log: {e}")
