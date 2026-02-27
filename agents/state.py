"""
LangGraph shared state schema for the Red Team agent swarm.

This TypedDict defines the state that flows through the LangGraph
state machine. All agent nodes read from and write to this state.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, Literal

from typing_extensions import TypedDict

from agents.a2a.messages import A2AMessage


class RedTeamState(TypedDict):
    """Shared state for the Red Team LangGraph workflow."""

    # ── Mission Identity ───────────────────────────────────────
    mission_id: str
    objective: str
    target: str  # e.g. "http://localhost:3000"

    # ── Phase Tracking ─────────────────────────────────────────
    phase: Literal["planning", "recon", "exploitation", "reporting", "complete"]

    # ── Message Accumulator ────────────────────────────────────
    # Using operator.add so each node appends to the list
    messages: Annotated[list[A2AMessage], operator.add]

    # ── Shared Intelligence ────────────────────────────────────
    blackboard: dict[str, Any]  # Aggregated findings from all agents

    # ── Agent Outputs ──────────────────────────────────────────
    recon_results: list[dict[str, Any]]   # Alpha's intelligence reports
    exploit_results: list[dict[str, Any]]  # Gamma's exploit results

    # ── Commander Strategy ─────────────────────────────────────
    current_tasks: list[dict[str, Any]]  # Active task assignments
    strategy: str  # Commander's current strategy text

    # ── Control Flow ───────────────────────────────────────────
    iteration: int  # Loop counter for PentAGI reflection
    max_iterations: int  # Safety limit
    needs_human_approval: bool  # HITL gate flag
    human_response: str | None  # Human's decision

    # ── Self-Reflection (Phase 3) ──────────────────────────────
    reflection_count: int  # Number of self-correction attempts
    max_reflections: int  # Max retries for failed exploits
    pending_exploit: dict[str, Any] | None  # Exploit awaiting HITL approval

    # ── GLOBAL AUTH CHAINING (Objective 3) ──────────────────────
    discovered_credentials: dict[str, dict]  # JWT, cookies, tokens discovered during exploit
    # Structure: {
    #     "jwt_token": {"value": "...", "target": "...", "type": "jwt"},
    #     "admin_cookie": {"value": "...", "target": "...", "type": "cookie"}
    # }
    
    contextual_memory: dict[str, Any]  # Session tokens, cookies from previous attempts

    # ── Mission Report ─────────────────────────────────────────
    report: dict[str, Any] | None  # Final mission report
    report_path: str | None  # Path to saved report file

    # ── Error Handling ─────────────────────────────────────────
    errors: list[str]  # Error messages accumulated during execution
