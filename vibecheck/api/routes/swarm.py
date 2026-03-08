"""
Swarm routes for Project VibeCheck.

Provides endpoints for:
- Triggering new swarm missions
- Getting mission status and events
- Real-time WebSocket updates
- Managing agent states
"""

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from core.supabase_client import get_supabase_client
from core.redis_bus import get_redis_bus

logger = logging.getLogger(__name__)

router = APIRouter()


# -------------------------------------------
# Request/Response Models
# -------------------------------------------

class SwarmTriggerRequest(BaseModel):
    """Request model for triggering a new swarm mission."""
    target: str = Field(..., description="Target URL or repository to attack")
    objective: str = Field(
        default="Execute a comprehensive security audit including: 1) Map attack surface, 2) Test for SQL injection, XSS, IDOR, auth bypass, 3) Attempt token hijacking and session manipulation, 4) Hunt for sensitive data exposure",
        description="Mission objective"
    )
    mode: str = Field(default="live", description="Scan mode: 'live' for running apps, 'static' for repos")
    max_iterations: int = Field(default=3, description="Maximum iterations for the mission")
    scan_id: str | None = Field(None, description="Optional existing scan ID to link to")


class SwarmTriggerResponse(BaseModel):
    """Response model for swarm mission trigger."""
    mission_id: str = Field(..., description="Unique mission identifier")
    message: str = Field(..., description="Status message")
    status: str = Field(..., description="Mission status")


class AgentStateResponse(BaseModel):
    """Response model for agent state."""
    agent_id: str
    agent_name: str
    agent_team: str
    status: str
    iter: str | None
    task: str | None
    recent_logs: list[dict]
    last_updated: datetime


class SwarmMissionResponse(BaseModel):
    """Response model for mission details."""
    mission_id: str
    scan_id: str | None = None
    target: str
    objective: str = ""
    mode: str | None = None
    status: str
    progress: int = 0
    current_phase: str | None = None
    iteration: int = 0
    max_iterations: int = 3
    findings_count: int = 0
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None


class SwarmEventResponse(BaseModel):
    """Response model for agent events."""
    id: str
    agent_name: str
    agent_team: str
    event_type: str
    message: str
    payload: dict
    iteration: int | None
    phase: str | None
    created_at: datetime


class SwarmFindingResponse(BaseModel):
    """Response model for swarm findings."""
    id: str
    title: str
    description: str | None
    severity: str
    finding_type: str | None
    source: str | None
    target: str | None
    endpoint: str | None
    confirmed: bool
    agent_name: str | None
    cve_id: str | None
    created_at: datetime
    exploit_attempt_id: str | None = None
    agent_iteration: int | None = None
    confidence_score: float | None = None


class SwarmEventTimelineResponse(BaseModel):
    """Response model for mission timeline view."""
    id: str
    mission_id: str
    event_type: str
    agent_name: str
    stage: str | None
    title: str
    description: str | None
    success: bool | None
    error_type: str | None
    created_at: datetime
    iteration: int | None
    execution_time_ms: int | None
    child_events: int | None
    exploit_type: str | None
    target_url: str | None
    was_deduplicated: bool | None
    attempt_number: int | None


class MissionStatisticsResponse(BaseModel):
    """Response model for mission statistics view."""
    mission_id: str
    target: str | None
    status: str | None
    created_at: datetime | None
    total_events: int | None
    exploit_events: int | None
    agent_starts: int | None
    total_exploit_attempts: int | None
    successful_exploits: int | None
    failed_exploits: int | None
    deduplicated_exploits: int | None
    deduplication_rate_pct: float | None
    total_findings: int | None
    critical_findings: int | None
    high_findings: int | None
    max_iteration: int | None


class SwarmExploitAttemptResponse(BaseModel):
    """Response model for swarm exploit attempts."""
    id: str
    mission_id: str
    event_id: str | None
    exploit_type: str
    target_url: str
    method: str
    payload: str | None
    payload_hash: str | None
    tool_used: str | None
    command_executed: str | None
    success: bool
    response_code: int | None
    exit_code: int | None
    error_type: str | None
    error_message: str | None
    stdout: str | None
    stderr: str | None
    evidence: dict
    created_at: datetime
    execution_time_ms: int | None
    was_deduplicated: bool
    deduplication_key: str | None
    attempt_number: int | None
    critic_evaluated: bool | None
    critic_success: bool | None
    critic_feedback: str | None


# -------------------------------------------
# WebSocket Connection Manager
# -------------------------------------------

class ConnectionManager:
    """Manages WebSocket connections for real-time mission updates."""
    
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, mission_id: str):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        if mission_id not in self.active_connections:
            self.active_connections[mission_id] = []
        self.active_connections[mission_id].append(websocket)
        logger.info(f"WebSocket client connected for mission {mission_id}")
    
    def disconnect(self, websocket: WebSocket, mission_id: str):
        """Remove a WebSocket connection."""
        if mission_id in self.active_connections:
            self.active_connections[mission_id].remove(websocket)
            if not self.active_connections[mission_id]:
                del self.active_connections[mission_id]
        logger.info(f"WebSocket client disconnected from mission {mission_id}")
    
    async def broadcast_to_mission(self, mission_id: str, message: dict):
        """Broadcast a message to all connected clients for a mission."""
        if mission_id not in self.active_connections:
            return
        
        disconnected = []
        for connection in self.active_connections[mission_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send WebSocket message: {e}")
                disconnected.append(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.active_connections[mission_id].remove(conn)


# Global connection manager
ws_manager = ConnectionManager()


# -------------------------------------------
# Swarm Endpoints
# -------------------------------------------

@router.get(
    "/missions",
    summary="List all swarm missions",
    description="Get all swarm missions from Supabase, ordered by creation date.",
)
async def list_swarm_missions(limit: int = 20, offset: int = 0) -> dict:
    """Get all swarm missions from Supabase."""
    logger.info(f"[SWARM] Listing missions - limit: {limit}, offset: {offset}")
    
    try:
        supabase = get_supabase_client()
        missions = await supabase.list_swarm_missions(limit=limit, offset=offset)
        logger.info(f"[SWARM] Found {len(missions)} missions")
        return {
            "missions": missions,
            "total": len(missions)
        }
    except Exception as e:
        logger.error(f"[SWARM] Failed to list missions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list missions: {str(e)}",
        )


@router.post(
    "/trigger",
    response_model=SwarmTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger a new swarm mission",
    description="Start a new Red Team swarm mission against a target.",
)
async def trigger_swarm_mission(request: SwarmTriggerRequest) -> SwarmTriggerResponse:
    """
    Trigger a new swarm penetration testing mission.
    
    This endpoint:
    1. Creates a mission record in Supabase
    2. Initializes agent states for all 12 agents
    3. Publishes the mission to Redis for the swarm module
    4. Returns the mission ID for tracking
    """
    logger.info(f"Received swarm mission request for target: {request.target}")
    
    # Generate unique mission ID
    mission_id = str(uuid4())
    
    try:
        # Create mission in Supabase
        supabase = get_supabase_client()
        await supabase.create_swarm_mission(
            mission_id=mission_id,
            target=request.target,
            objective=request.objective,
            mode=request.mode,
            max_iterations=request.max_iterations,
            scan_id=request.scan_id,
        )
        
        # Initialize agent states
        await _initialize_agent_states(mission_id)
        
        # Publish to Redis for swarm module
        redis_bus = get_redis_bus()
        await redis_bus.publish("swarm_missions", {
            "mission_id": mission_id,
            "target": request.target,
            "objective": request.objective,
            "mode": request.mode,
            "max_iterations": request.max_iterations,
            "action": "start",
        })
        
        logger.info(f"Swarm mission {mission_id} triggered successfully")
        
        return SwarmTriggerResponse(
            mission_id=mission_id,
            message="Swarm mission triggered successfully",
            status="pending",
        )
        
    except Exception as e:
        logger.error(f"Failed to trigger swarm mission: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger mission: {str(e)}",
        )


@router.get(
    "/{mission_id}",
    response_model=SwarmMissionResponse,
    summary="Get mission status",
    description="Get the current status and details of a swarm mission.",
)
async def get_mission(mission_id: str) -> SwarmMissionResponse:
    """Get mission details and current status."""
    try:
        supabase = get_supabase_client()
        
        logger.info(f"[SWARM] Fetching mission status for ID: {mission_id}")
        mission = await supabase.get_swarm_mission(mission_id)
        
        if not mission:
            logger.warning(f"[SWARM] Mission not found: {mission_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mission {mission_id} not found",
            )
        
        logger.info(f"[SWARM] Mission found - id={mission.get('id')}, status={mission.get('status')}, target={mission.get('target')}")
        
        # Count findings
        findings = await supabase.get_swarm_findings(mission_id)
        logger.info(f"[SWARM] Found {len(findings)} findings for mission {mission_id}")
        
        return SwarmMissionResponse(
            mission_id=mission["id"],
            scan_id=mission.get("scan_id"),
            target=mission["target"],
            objective=mission["objective"],
            mode=mission["mode"],
            status=mission["status"],
            progress=mission["progress"],
            current_phase=mission.get("current_phase"),
            iteration=mission["iteration"],
            max_iterations=mission["max_iterations"],
            findings_count=len(findings),
            created_at=mission["created_at"],
            started_at=mission.get("started_at"),
            completed_at=mission.get("completed_at"),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get mission {mission_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get mission: {str(e)}",
        )


@router.get(
    "/{mission_id}/agents",
    response_model=list[AgentStateResponse],
    summary="Get agent states",
    description="Get the current state of all agents in a mission.",
)
async def get_agent_states(mission_id: str) -> list[AgentStateResponse]:
    """Get current states of all agents in a mission."""
    try:
        supabase = get_supabase_client()
        states = await supabase.get_swarm_agent_states(mission_id)
        
        return [
            AgentStateResponse(
                agent_id=state["agent_id"],
                agent_name=state["agent_name"],
                agent_team=state["agent_team"],
                status=state["status"],
                iter=state.get("iter"),
                task=state.get("task"),
                recent_logs=state.get("recent_logs", []),
                last_updated=state["last_updated"],
            )
            for state in states
        ]
        
    except Exception as e:
        logger.error(f"Failed to get agent states for {mission_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get agent states: {str(e)}",
        )


@router.get(
    "/{mission_id}/events",
    response_model=list[SwarmEventResponse],
    summary="Get mission events",
    description="Get recent events/logs from a swarm mission.",
)
async def get_mission_events(
    mission_id: str,
    limit: int = 100,
    agent: str | None = None,
) -> list[SwarmEventResponse]:
    """Get recent events for a mission."""
    try:
        supabase = get_supabase_client()
        
        logger.info(f"[SWARM] Fetching events for mission: {mission_id}, agent: {agent}, limit: {limit}")
        events = await supabase.get_swarm_agent_events(mission_id, limit=limit, agent_name=agent)
        
        logger.info(f"[SWARM] Retrieved {len(events)} events from Supabase")
        
        return [
            SwarmEventResponse(
                id=event["id"],
                agent_name=event["agent_name"],
                agent_team=event["agent_team"],
                event_type=event["event_type"],
                message=event["message"],
                payload=event.get("payload", {}),
                iteration=event.get("iteration"),
                phase=event.get("phase"),
                created_at=event["created_at"],
            )
            for event in events
        ]
        
    except Exception as e:
        logger.error(f"Failed to get events for {mission_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get events: {str(e)}",
        )


@router.get(
    "/{mission_id}/timeline-events",
    response_model=list[dict],
    summary="Get timeline events",
    description="Get timeline events from the new swarm_events table.",
)
async def get_timeline_events(
    mission_id: str,
    limit: int = 100,
    event_type: str | None = None,
    agent: str | None = None,
    iteration: int | None = None,
) -> list[dict]:
    """Get timeline events from the new swarm_events table."""
    try:
        supabase = get_supabase_client()
        events = await supabase.get_swarm_events(
            mission_id, limit=limit, event_type=event_type, 
            agent_name=agent, iteration=iteration
        )
        return events
        
    except Exception as e:
        logger.error(f"Failed to get timeline events for {mission_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get timeline events: {str(e)}",
        )


@router.get(
    "/{mission_id}/findings",
    response_model=list[SwarmFindingResponse],
    summary="Get mission findings",
    description="Get all vulnerabilities discovered during a mission.",
)
async def get_mission_findings(mission_id: str) -> list[SwarmFindingResponse]:
    """Get all findings for a mission."""
    try:
        supabase = get_supabase_client()
        
        logger.info(f"[SWARM] Fetching findings for mission: {mission_id}")
        findings = await supabase.get_swarm_findings(mission_id)
        
        logger.info(f"[SWARM] Retrieved {len(findings)} findings from Supabase")
        
        # Log finding details
        for i, finding in enumerate(findings[:5]):
            logger.info(f"[SWARM] Finding {i+1}: severity={finding.get('severity')}, "
                       f"type={finding.get('finding_type')}, confirmed={finding.get('confirmed')}")
        
        return [
            SwarmFindingResponse(
                id=finding["id"],
                title=finding["title"],
                description=finding.get("description"),
                severity=finding["severity"],
                finding_type=finding.get("finding_type"),
                source=finding.get("source"),
                target=finding.get("target"),
                endpoint=finding.get("endpoint"),
                confirmed=finding["confirmed"],
                agent_name=finding.get("agent_name"),
                cve_id=finding.get("cve_id"),
                created_at=finding["created_at"],
                exploit_attempt_id=finding.get("exploit_attempt_id"),
                agent_iteration=finding.get("agent_iteration"),
                confidence_score=finding.get("confidence_score"),
            )
            for finding in findings
        ]
        
    except Exception as e:
        logger.error(f"Failed to get findings for {mission_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get findings: {str(e)}",
        )


@router.get(
    "/{mission_id}/timeline",
    response_model=list[SwarmEventTimelineResponse],
    summary="Get mission timeline",
    description="Get complete mission timeline from the database view.",
)
async def get_mission_timeline(mission_id: str) -> list[SwarmEventTimelineResponse]:
    """Get mission timeline from the database view."""
    try:
        supabase = get_supabase_client()
        timeline = await supabase.get_mission_timeline(mission_id)
        
        return [
            SwarmEventTimelineResponse(
                id=event["id"],
                mission_id=event["mission_id"],
                event_type=event["event_type"],
                agent_name=event["agent_name"],
                stage=event.get("stage"),
                title=event["title"],
                description=event.get("description"),
                success=event.get("success"),
                error_type=event.get("error_type"),
                created_at=event["created_at"],
                iteration=event.get("iteration"),
                execution_time_ms=event.get("execution_time_ms"),
                child_events=event.get("child_events"),
                exploit_type=event.get("exploit_type"),
                target_url=event.get("target_url"),
                was_deduplicated=event.get("was_deduplicated"),
                attempt_number=event.get("attempt_number"),
            )
            for event in timeline
        ]
        
    except Exception as e:
        logger.error(f"Failed to get timeline for {mission_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get timeline: {str(e)}",
        )


@router.get(
    "/{mission_id}/statistics",
    response_model=MissionStatisticsResponse,
    summary="Get mission statistics",
    description="Get aggregated mission statistics from the database view.",
)
async def get_mission_statistics(mission_id: str) -> MissionStatisticsResponse:
    """Get mission statistics from the database view."""
    try:
        supabase = get_supabase_client()
        stats = await supabase.get_mission_statistics(mission_id)
        
        if not stats:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Statistics not found for mission {mission_id}",
            )
        
        return MissionStatisticsResponse(
            mission_id=stats["mission_id"],
            target=stats.get("target"),
            status=stats.get("status"),
            created_at=stats.get("created_at"),
            total_events=stats.get("total_events"),
            exploit_events=stats.get("exploit_events"),
            agent_starts=stats.get("agent_starts"),
            total_exploit_attempts=stats.get("total_exploit_attempts"),
            successful_exploits=stats.get("successful_exploits"),
            failed_exploits=stats.get("failed_exploits"),
            deduplicated_exploits=stats.get("deduplicated_exploits"),
            deduplication_rate_pct=stats.get("deduplication_rate_pct"),
            total_findings=stats.get("total_findings"),
            critical_findings=stats.get("critical_findings"),
            high_findings=stats.get("high_findings"),
            max_iteration=stats.get("max_iteration"),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get statistics for {mission_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get statistics: {str(e)}",
        )


@router.get(
    "/{mission_id}/exploit-attempts",
    response_model=list[SwarmExploitAttemptResponse],
    summary="Get exploit attempts",
    description="Get all exploit attempts for a mission.",
)
async def get_exploit_attempts(
    mission_id: str,
    exploit_type: str | None = None,
    success: bool | None = None,
) -> list[SwarmExploitAttemptResponse]:
    """Get all exploit attempts for a mission."""
    try:
        supabase = get_supabase_client()
        attempts = await supabase.get_swarm_exploit_attempts(
            mission_id, exploit_type=exploit_type, success=success
        )
        
        return [
            SwarmExploitAttemptResponse(
                id=attempt["id"],
                mission_id=attempt["mission_id"],
                event_id=attempt.get("event_id"),
                exploit_type=attempt["exploit_type"],
                target_url=attempt["target_url"],
                method=attempt["method"],
                payload=attempt.get("payload"),
                payload_hash=attempt.get("payload_hash"),
                tool_used=attempt.get("tool_used"),
                command_executed=attempt.get("command_executed"),
                success=attempt.get("success", False),
                response_code=attempt.get("response_code"),
                exit_code=attempt.get("exit_code"),
                error_type=attempt.get("error_type"),
                error_message=attempt.get("error_message"),
                stdout=attempt.get("stdout"),
                stderr=attempt.get("stderr"),
                evidence=attempt.get("evidence", {}),
                created_at=attempt["created_at"],
                execution_time_ms=attempt.get("execution_time_ms"),
                was_deduplicated=attempt.get("was_deduplicated", False),
                deduplication_key=attempt.get("deduplication_key"),
                attempt_number=attempt.get("attempt_number"),
                critic_evaluated=attempt.get("critic_evaluated"),
                critic_success=attempt.get("critic_success"),
                critic_feedback=attempt.get("critic_feedback"),
            )
            for attempt in attempts
        ]
        
    except Exception as e:
        logger.error(f"Failed to get exploit attempts for {mission_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get exploit attempts: {str(e)}",
        )


@router.websocket("/ws/{mission_id}")
async def swarm_websocket(websocket: WebSocket, mission_id: str):
    """
    WebSocket endpoint for real-time mission updates.
    
    Clients can connect to this endpoint to receive real-time updates
    about mission progress, agent states, and new findings.
    """
    await ws_manager.connect(websocket, mission_id)
    
    try:
        # Send initial mission state
        supabase = get_supabase_client()
        mission = await supabase.get_swarm_mission(mission_id)
        
        if mission:
            await websocket.send_json({
                "type": "mission_state",
                "data": mission,
            })
        
        # Keep connection alive and handle client messages
        while True:
            try:
                # Wait for messages from client (heartbeat, commands, etc.)
                data = await websocket.receive_json()
                
                # Handle client commands
                if data.get("action") == "ping":
                    await websocket.send_json({"type": "pong"})
                    
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.warning(f"WebSocket error for mission {mission_id}: {e}")
                break
                
    except Exception as e:
        logger.error(f"WebSocket error for mission {mission_id}: {e}")
    finally:
        ws_manager.disconnect(websocket, mission_id)


@router.post(
    "/{mission_id}/cancel",
    response_model=dict,
    summary="Cancel a mission",
    description="Cancel a running swarm mission.",
)
async def cancel_mission(mission_id: str) -> dict:
    """Cancel a running swarm mission."""
    try:
        supabase = get_supabase_client()
        
        # Update mission status
        await supabase.update_swarm_mission(
            mission_id=mission_id,
            updates={
                "status": "cancelled",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        
        # Publish cancel command to Redis
        redis_bus = get_redis_bus()
        await redis_bus.publish("swarm_missions", {
            "mission_id": mission_id,
            "action": "cancel",
        })
        
        # Notify WebSocket clients
        await ws_manager.broadcast_to_mission(mission_id, {
            "type": "mission_cancelled",
            "mission_id": mission_id,
        })
        
        return {"message": "Mission cancelled", "mission_id": mission_id}
        
    except Exception as e:
        logger.error(f"Failed to cancel mission {mission_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel mission: {str(e)}",
        )


# -------------------------------------------
# Helper Functions
# -------------------------------------------

async def _initialize_agent_states(mission_id: str):
    """Initialize agent states for a new mission."""
    supabase = get_supabase_client()
    
    # Define all 12 agents
    agents = [
        {"id": "purple-cmd", "name": "Purple Commander", "team": "purple"},
        {"id": "kg-agent", "name": "Knowledge Graph", "team": "blue"},
        {"id": "sast-agent", "name": "SAST Semgrep", "team": "blue"},
        {"id": "llm-verify", "name": "LLM Verifier", "team": "blue"},
        {"id": "traffic-mon", "name": "Traffic Monitor", "team": "blue2"},
        {"id": "sig-detect", "name": "Signature Detector", "team": "blue2"},
        {"id": "redis-pub", "name": "Redis Bridge", "team": "blue2"},
        {"id": "red-cmd", "name": "Red Commander", "team": "red"},
        {"id": "alpha-recon", "name": "Alpha Recon", "team": "red"},
        {"id": "gamma-exploit", "name": "Gamma Exploit", "team": "red"},
        {"id": "critic", "name": "Critic Agent", "team": "red"},
        {"id": "sandbox", "name": "Sandbox Container", "team": "sand"},
    ]
    
    for agent in agents:
        await supabase.create_swarm_agent_state(
            mission_id=mission_id,
            agent_id=agent["id"],
            agent_name=agent["name"],
            agent_team=agent["team"],
            status="idle",
            iter="PENDING",
            task="Waiting for mission start...",
        )
