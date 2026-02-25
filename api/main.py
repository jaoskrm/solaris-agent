"""
FastAPI backend for the Red Team Agent Swarm frontend.

This provides a REST API wrapper around the LangGraph agent system.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add project root to path
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configure logging BEFORE imports that might fail
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)-20s] %(levelname)-7s %(message)s",
)
logger = logging.getLogger("api")

# Try to import agent modules - wrap in try/except to handle import errors gracefully
try:
    from agents.graph import build_red_team_graph, create_initial_state
    from agents.state import RedTeamState
    from core.config import settings
    AGENTS_AVAILABLE = True
    logger.info("Agent modules imported successfully")
except ImportError as e:
    logger.warning(f"Could not import agent modules: {e}")
    AGENTS_AVAILABLE = False
    # Create dummy functions for demo mode
    def build_red_team_graph():
        return None
    def create_initial_state(**kwargs):
        return {}
    class RedTeamState:
        pass
    class settings:
        pass

# Create FastAPI app
app = FastAPI(
    title="Red Team Agent Swarm API",
    description="REST API for the Red Team multi-agent penetration testing system",
    version="0.1.0",
)

# Add CORS middleware - more permissive for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

logger.info("CORS middleware configured")

# In-memory storage for mission states (in production, use a database)
missions: dict[str, dict] = {}


# ── Request/Response Models ────────────────────────────────────────────────

class StartMissionRequest(BaseModel):
    target: str
    objective: Optional[str] = None
    mission_id: Optional[str] = None


class StartMissionResponse(BaseModel):
    mission_id: str
    message: str


class MissionStatusResponse(BaseModel):
    mission_id: str
    phase: str
    status: str
    progress: int
    current_agent: Optional[str]
    error_message: Optional[str]


class Vulnerability(BaseModel):
    id: str
    type: str
    severity: str
    title: str
    description: Optional[str]
    file_path: Optional[str]
    line_number: Optional[int]
    evidence: Optional[str]
    remediation: Optional[str]
    confirmed: bool


class MissionReportResponse(BaseModel):
    mission_id: str
    target: str
    objective: str
    phase: str
    report: dict
    recon_results: list
    exploit_results: list
    errors: list


# ── Helper Functions ────────────────────────────────────────────────────────

def calculate_progress(phase: str) -> int:
    """Calculate progress percentage based on phase."""
    phase_progress = {
        "planning": 10,
        "recon": 35,
        "exploitation": 65,
        "reporting": 90,
        "complete": 100,
    }
    return phase_progress.get(phase, 0)


async def run_mission_background(mission_id: str, target: str, objective: str):
    """Run the mission in the background."""
    try:
        missions[mission_id]["status"] = "running"
        
        if not AGENTS_AVAILABLE:
            # Demo mode - simulate a mission
            logger.info(f"Running mission {mission_id} in DEMO mode (agents not available)")
            await asyncio.sleep(2)  # Simulate planning
            
            missions[mission_id]["phase"] = "recon"
            missions[mission_id]["current_agent"] = "alpha_recon"
            missions[mission_id]["progress"] = 35
            await asyncio.sleep(3)  # Simulate recon
            
            missions[mission_id]["recon_results"] = [
                {"type": "port_scan", "data": f"Simulated scan results for {target}"},
                {"type": "service_detection", "data": "HTTP/80, HTTPS/443"},
            ]
            
            missions[mission_id]["phase"] = "exploitation"
            missions[mission_id]["current_agent"] = "gamma_exploit"
            missions[mission_id]["progress"] = 65
            await asyncio.sleep(2)  # Simulate exploitation
            
            missions[mission_id]["exploit_results"] = [
                {"type": "vulnerability", "data": "Simulated XSS vulnerability found"},
            ]
            
            missions[mission_id]["phase"] = "reporting"
            missions[mission_id]["current_agent"] = "report_generator"
            missions[mission_id]["progress"] = 90
            await asyncio.sleep(1)  # Simulate reporting
            
            missions[mission_id]["report"] = {
                "summary": f"Security assessment for {target}",
                "findings": ["Simulated XSS vulnerability"],
                "recommendations": ["Implement input validation"],
            }
        else:
            # Build the graph
            graph = build_red_team_graph()
            
            # Create initial state
            initial_state = create_initial_state(
                mission_id=mission_id,
                objective=objective,
                target=target,
            )
            
            # Run the graph
            logger.info(f"Starting mission {mission_id} for target {target}")
            
            # Stream events from the graph
            async for event in graph.astream(initial_state):
                # Update mission state based on event
                if "__end__" not in event:
                    node_name = list(event.keys())[0]
                    node_output = event[node_name]
                    
                    logger.info(f"Mission {mission_id}: Node {node_name} completed")
                    
                    # Update phase based on node
                    if node_name == "commander":
                        missions[mission_id]["phase"] = "planning"
                        missions[mission_id]["current_agent"] = "commander"
                    elif node_name == "alpha_recon":
                        missions[mission_id]["phase"] = "recon"
                        missions[mission_id]["current_agent"] = "alpha_recon"
                    elif node_name == "gamma_exploit":
                        missions[mission_id]["phase"] = "exploitation"
                        missions[mission_id]["current_agent"] = "gamma_exploit"
                    elif node_name == "report_generator":
                        missions[mission_id]["phase"] = "reporting"
                        missions[mission_id]["current_agent"] = "report_generator"
                    
                    missions[mission_id]["progress"] = calculate_progress(
                        missions[mission_id]["phase"]
                    )
                    
                    # Store results
                    if isinstance(node_output, dict):
                        if "recon_results" in node_output:
                            missions[mission_id]["recon_results"].extend(
                                node_output.get("recon_results", [])
                            )
                        if "exploit_results" in node_output:
                            missions[mission_id]["exploit_results"].extend(
                                node_output.get("exploit_results", [])
                            )
                        if "report" in node_output and node_output["report"]:
                            missions[mission_id]["report"] = node_output["report"]
                        if "errors" in node_output:
                            missions[mission_id]["errors"].extend(
                                node_output.get("errors", [])
                            )
        
        # Mission completed
        missions[mission_id]["status"] = "completed"
        missions[mission_id]["phase"] = "complete"
        missions[mission_id]["progress"] = 100
        missions[mission_id]["current_agent"] = None
        missions[mission_id]["completed_at"] = datetime.utcnow().isoformat()
        
        logger.info(f"Mission {mission_id} completed successfully")
        
    except Exception as e:
        logger.error(f"Mission {mission_id} failed: {e}")
        missions[mission_id]["status"] = "failed"
        missions[mission_id]["errors"].append(str(e))


# ── API Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Red Team Agent Swarm API", "status": "running"}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    logger.info("Health check called")
    return {"status": "healthy", "agents_available": AGENTS_AVAILABLE}


@app.post("/api/mission/start", response_model=StartMissionResponse)
async def start_mission(request: StartMissionRequest):
    """Start a new security assessment mission."""
    mission_id = request.mission_id or str(uuid.uuid4())
    objective = request.objective or f"Assess security of {request.target}"
    
    # Initialize mission state
    missions[mission_id] = {
        "mission_id": mission_id,
        "target": request.target,
        "objective": objective,
        "phase": "planning",
        "status": "pending",
        "progress": 5,
        "current_agent": "commander",
        "recon_results": [],
        "exploit_results": [],
        "report": None,
        "errors": [],
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    
    # Start mission in background
    asyncio.create_task(
        run_mission_background(mission_id, request.target, objective)
    )
    
    return StartMissionResponse(
        mission_id=mission_id,
        message=f"Mission started for target: {request.target}",
    )


@app.get("/api/mission/{mission_id}/status", response_model=MissionStatusResponse)
async def get_mission_status(mission_id: str):
    """Get the current status of a mission."""
    if mission_id not in missions:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    mission = missions[mission_id]
    
    return MissionStatusResponse(
        mission_id=mission_id,
        phase=mission["phase"],
        status=mission["status"],
        progress=mission["progress"],
        current_agent=mission["current_agent"],
        error_message=mission["errors"][0] if mission["errors"] else None,
    )


@app.get("/api/mission/{mission_id}/report", response_model=MissionReportResponse)
async def get_mission_report(mission_id: str):
    """Get the full mission report."""
    if mission_id not in missions:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    mission = missions[mission_id]
    
    return MissionReportResponse(
        mission_id=mission_id,
        target=mission["target"],
        objective=mission["objective"],
        phase=mission["phase"],
        report=mission["report"] or {},
        recon_results=mission["recon_results"],
        exploit_results=mission["exploit_results"],
        errors=mission["errors"],
    )


@app.get("/api/mission/{mission_id}/messages")
async def get_mission_messages(mission_id: str):
    """Get all agent messages for a mission."""
    if mission_id not in missions:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    # For now, return empty messages
    # In a full implementation, this would return A2A messages
    return {"messages": []}


@app.get("/api/mission/{mission_id}/blackboard")
async def get_mission_blackboard(mission_id: str):
    """Get the shared blackboard for a mission."""
    if mission_id not in missions:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    mission = missions[mission_id]
    
    # Extract blackboard data from results
    blackboard = {
        "target_info": {
            "url": mission["target"],
            "tech_stack": [],
            "open_ports": [],
            "services": {},
        },
        "vulnerabilities": [],
        "exploitation_results": mission["exploit_results"],
        "attack_paths": [],
    }
    
    # Extract vulnerabilities from recon results
    for result in mission["recon_results"]:
        if isinstance(result, dict) and "findings" in result:
            blackboard["vulnerabilities"].extend(result["findings"])
    
    return {"blackboard": blackboard}


@app.post("/api/mission/{mission_id}/cancel")
async def cancel_mission(mission_id: str):
    """Cancel a running mission."""
    if mission_id not in missions:
        raise HTTPException(status_code=404, detail="Mission not found")
    
    mission = missions[mission_id]
    if mission["status"] == "running":
        mission["status"] = "cancelled"
        return {"cancelled": True}
    
    return {"cancelled": False, "message": "Mission is not running"}


@app.get("/api/missions")
async def list_missions():
    """List all missions."""
    return {
        "missions": [
            {
                "mission_id": m["mission_id"],
                "target": m["target"],
                "status": m["status"],
                "phase": m["phase"],
                "created_at": m["created_at"],
            }
            for m in missions.values()
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
