"""
Supabase client for Red Team kill chain event persistence.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

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
        
        event_data = {
            "mission_id": mission_id,
            "stage": stage,
            "agent": agent,
            "event_type": event_type,
            "details": details,
            "target": target,
            "success": success,
            "human_intervention": human_intervention,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self._client.table("kill_chain_events").insert(event_data).execute()
            )
            logger.debug(f"Logged kill chain event: {stage}/{event_type}")
            return True
        except Exception as e:
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
            "progress_pct": progress_pct,
            "updated_at": datetime.utcnow().isoformat(),
        }
        if current_stage:
            update_data["current_stage"] = current_stage
        if findings_count is not None:
            update_data["findings_count"] = findings_count
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self._client.table("missions")
                .update(update_data)
                .eq("id", mission_id)
                .execute()
            )
            return True
        except Exception as e:
            logger.error(f"Failed to update mission status: {e}")
            return False


    # ==================== REAL-TIME REPORTING METHODS ====================
    
    async def create_mission(
        self,
        mission_id: str,
        target: str,
        objective: str | None = None,
        mode: str = "live",
    ) -> dict[str, Any] | None:
        """Create a new mission record in Supabase.
        
        Returns the created mission data or None if failed.
        """
        if not self._enabled:
            logger.debug(f"Supabase not enabled - mission {mission_id} would be created")
            return None
        
        mission_data = {
            "mission_id": mission_id,
            "target": target,
            "objective": objective,
            "mode": mode,
            "status": "running",
            "start_time": datetime.utcnow().isoformat(),
        }
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self._client.table("missions").insert(mission_data).execute()
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
            "end_time": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self._client.table("missions")
                .update(update_data)
                .eq("mission_id", mission_id)
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
        
        event_data = {
            "mission_id": mission_id,
            "event_type": event_type,
            "payload_json": payload_json,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self._client.table("mission_events").insert(event_data).execute()
            )
            logger.debug(f"Logged mission event: {event_type} for {mission_id}")
            return True
        except Exception as e:
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
            query = self._client.table("mission_events").select("*").eq("mission_id", mission_id)
            
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
    """Get or create Supabase client singleton."""
    global _supabase_client
    if _supabase_client is None:
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
    try:
        client = get_supabase_client()
        if client._enabled:
            # Create task without awaiting - it runs in background
            asyncio.create_task(
                client.log_mission_event(mission_id, event_type, payload_json)
            )
    except Exception as e:
        logger.debug(f"Failed to queue event log: {e}")
