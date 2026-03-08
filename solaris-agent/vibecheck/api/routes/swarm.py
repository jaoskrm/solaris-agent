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
    scan_id: str | None
    target: str
    objective: str
    mode: str
    status: str
    progress: int
    current_phase: str | None
    iteration: int
    max_iterations: int
    findings_count: int
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


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
        mission = await supabase.get_swarm_mission(mission_id)
        
        if not mission:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mission {mission_id} not found",
            )
        
        # Count findings
        findings = await supabase.get_swarm_findings(mission_id)
        
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
        events = await supabase.get_swarm_agent_events(mission_id, limit=limit, agent_name=agent)
        
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
    "/{mission_id}/findings",
    response_model=list[SwarmFindingResponse],
    summary="Get mission findings",
    description="Get all vulnerabilities discovered during a mission.",
)
async def get_mission_findings(mission_id: str) -> list[SwarmFindingResponse]:
    """Get all findings for a mission."""
    try:
        supabase = get_supabase_client()
        findings = await supabase.get_swarm_findings(mission_id)
        
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
            )
            for finding in findings
        ]
        
    except Exception as e:
        logger.error(f"Failed to get findings for {mission_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get findings: {str(e)}",
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
