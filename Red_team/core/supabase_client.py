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


# Singleton instance
_supabase_client: RedTeamSupabaseClient | None = None


def get_supabase_client(url: str | None = None, key: str | None = None) -> RedTeamSupabaseClient:
    """Get or create Supabase client singleton."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = RedTeamSupabaseClient(url, key)
    return _supabase_client
