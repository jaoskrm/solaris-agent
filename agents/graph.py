"""
LangGraph state machine for the Red Team agent swarm.

Execution flow:
  Commander Plan → Alpha Recon → Gamma Exploit → HITL Gate → Commander Observe
                          ↑                                         │
                          └──── loop if not complete ─────────────────┘
                                                                    ↓
                                                              Report Gen → END

The graph runs until Commander declares phase="complete" or
max_iterations is reached.

Phase 3 additions:
  - HITL Safety Gate: Human approval for destructive exploits
  - Self-Reflection: Gamma retries failed exploits with modified payloads
  - Report Generation: Comprehensive mission report on completion
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from langgraph.graph import END, StateGraph

from agents.state import RedTeamState
from agents.commander import commander_plan, commander_observe
from agents.alpha_recon import alpha_recon
from agents.gamma_exploit import gamma_exploit, hitl_approval_gate
from agents.report_generator import generate_mission_report, save_report, format_report_text

logger = logging.getLogger(__name__)


async def generate_report_node(state: RedTeamState) -> dict[str, Any]:
    """
    Report generation node - creates and saves mission report.
    
    This node runs when the mission completes (either by Commander
    declaration or max iterations reached).
    """
    logger.info("=" * 60)
    logger.info("MISSION COMPLETE - Generating Report")
    logger.info("=" * 60)
    
    # Generate the report
    report = generate_mission_report(state)
    
    # Print report to console
    print("\n" + format_report_text(report))
    
    # Save report to files
    try:
        json_path, text_path = await save_report(report)
        logger.info("Report saved to: %s", text_path)
    except Exception as e:
        logger.error("Failed to save report: %s", e)
        text_path = None
    
    # Return state updates
    return {
        "report": report,
        "report_path": text_path,
        "phase": "complete",
    }


def should_continue(state: RedTeamState) -> str:
    """
    Routing function after Commander Observe.
    Decides whether to loop back for another cycle or end.
    """
    phase = state.get("phase", "complete")
    iteration = state.get("iteration", 0)
    max_iter = state.get("max_iterations", 5)

    if phase == "complete":
        logger.info("Mission complete — Commander declared phase=complete")
        return "report"

    if iteration >= max_iter:
        logger.warning("Max iterations (%d) reached — forcing completion", max_iter)
        return "report"

    if phase == "exploitation":
        logger.info("Moving to exploitation phase — routing to Gamma")
        return "exploit_only"

    # Default: continue recon cycle
    logger.info("Continuing recon cycle — iteration %d", iteration)
    return "continue"


def build_red_team_graph() -> StateGraph:
    """
    Construct the LangGraph state machine for the red team swarm.

    Returns a compiled graph ready for invocation.
    """
    graph = StateGraph(RedTeamState)

    # ── Add Nodes ──────────────────────────────────────────────
    graph.add_node("commander_plan", commander_plan)
    graph.add_node("alpha_recon", alpha_recon)
    graph.add_node("gamma_exploit", gamma_exploit)
    graph.add_node("hitl_gate", hitl_approval_gate)  # Phase 3: HITL safety gate
    graph.add_node("commander_observe", commander_observe)
    graph.add_node("generate_report", generate_report_node)  # Report generation

    # ── Set Entry Point ────────────────────────────────────────
    graph.set_entry_point("commander_plan")

    # ── Define Edges ───────────────────────────────────────────
    # Commander Plan → Alpha Recon (always starts with recon)
    graph.add_edge("commander_plan", "alpha_recon")

    # Alpha Recon → Gamma Exploit (recon feeds into exploitation)
    graph.add_edge("alpha_recon", "gamma_exploit")

    # Gamma Exploit → HITL Gate (Phase 3: safety check before results)
    graph.add_edge("gamma_exploit", "hitl_gate")

    # HITL Gate → Commander Observe
    graph.add_edge("hitl_gate", "commander_observe")

    # Commander Observe → conditional routing
    graph.add_conditional_edges(
        "commander_observe",
        should_continue,
        {
            "continue": "alpha_recon",       # Back to recon for next cycle
            "exploit_only": "gamma_exploit",  # Skip recon, go straight to exploit
            "report": "generate_report",      # Mission complete, generate report
        },
    )

    # Report Generation → END
    graph.add_edge("generate_report", END)

    return graph.compile()


def create_initial_state(
    objective: str,
    target: str,
    max_iterations: int = 5,
    mission_id: str | None = None,
    max_reflections: int = 3,
) -> RedTeamState:
    """
    Create the initial state for a red team mission.
    """
    return RedTeamState(
        mission_id=mission_id or str(uuid.uuid4())[:8],
        objective=objective,
        target=target,
        phase="planning",
        messages=[],
        blackboard={},
        recon_results=[],
        exploit_results=[],
        current_tasks=[],
        strategy="",
        iteration=0,
        max_iterations=max_iterations,
        needs_human_approval=False,
        human_response=None,
        reflection_count=0,
        max_reflections=max_reflections,
        pending_exploit=None,
        report=None,
        report_path=None,
        errors=[],
    )
