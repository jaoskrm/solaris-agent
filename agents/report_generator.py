"""
Mission Report Generator — Creates comprehensive reports after mission completion.

Generates JSON and text reports summarizing:
- Mission objectives and targets
- Reconnaissance findings
- Exploitation results
- Kill chain progress
- Recommendations
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from agents.a2a.messages import A2AMessage, MessageType, AgentRole
from agents.state import RedTeamState

logger = logging.getLogger(__name__)


def generate_mission_report(state: RedTeamState) -> dict[str, Any]:
    """
    Generate a comprehensive mission report from the final state.
    
    Returns a dict containing the full report data.
    """
    report = {
        "report_metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mission_id": state.get("mission_id", "unknown"),
            "report_version": "1.0",
        },
        "mission_summary": {
            "objective": state.get("objective", ""),
            "target": state.get("target", ""),
            "final_phase": state.get("phase", "unknown"),
            "iterations_completed": state.get("iteration", 0),
            "max_iterations": state.get("max_iterations", 0),
            "strategy": state.get("strategy", ""),
        },
        "reconnaissance_findings": _extract_recon_findings(state),
        "exploitation_results": _extract_exploit_results(state),
        "kill_chain_progress": _analyze_kill_chain(state),
        "statistics": _compute_statistics(state),
        "recommendations": _generate_recommendations(state),
        "errors": state.get("errors", []),
    }
    
    return report


def _extract_recon_findings(state: RedTeamState) -> list[dict[str, Any]]:
    """Extract and format reconnaissance findings."""
    findings = []
    
    for msg in state.get("messages", []):
        if isinstance(msg, A2AMessage) and msg.type == MessageType.INTELLIGENCE_REPORT:
            payload = msg.payload
            findings.append({
                "asset": payload.get("asset", "unknown"),
                "finding": payload.get("finding", ""),
                "confidence": payload.get("confidence", 0.0),
                "evidence": payload.get("evidence", ""),
                "cve_hint": payload.get("cve_hint"),
                "recommended_action": payload.get("recommended_action", ""),
                "priority": msg.priority.value if hasattr(msg.priority, 'value') else str(msg.priority),
            })
    
    # Also include recon_results from state
    for result in state.get("recon_results", []):
        if result not in findings:
            findings.append(result)
    
    return findings


def _extract_exploit_results(state: RedTeamState) -> list[dict[str, Any]]:
    """Extract and format exploitation results."""
    results = []
    
    for msg in state.get("messages", []):
        if isinstance(msg, A2AMessage) and msg.type == MessageType.EXPLOIT_RESULT:
            payload = msg.payload
            results.append({
                "target": payload.get("target", "unknown"),
                "exploit_type": payload.get("exploit_type", "unknown"),
                "success": payload.get("success", False),
                "payload_used": payload.get("payload_used", ""),
                "response_code": payload.get("response_code"),
                "evidence": payload.get("evidence", ""),
                "impact": payload.get("impact", ""),
                "priority": msg.priority.value if hasattr(msg.priority, 'value') else str(msg.priority),
            })
    
    # Also include exploit_results from state
    for result in state.get("exploit_results", []):
        if result not in results:
            results.append(result)
    
    return results


def _analyze_kill_chain(state: RedTeamState) -> dict[str, Any]:
    """Analyze kill chain progress based on findings."""
    phases_completed = []
    
    # Reconnaissance
    if state.get("recon_results") or any(
        isinstance(msg, A2AMessage) and msg.type == MessageType.INTELLIGENCE_REPORT
        for msg in state.get("messages", [])
    ):
        phases_completed.append("reconnaissance")
    
    # Weaponization (exploit planning)
    if state.get("current_tasks"):
        phases_completed.append("weaponization")
    
    # Exploitation
    if state.get("exploit_results") or any(
        isinstance(msg, A2AMessage) and msg.type == MessageType.EXPLOIT_RESULT
        for msg in state.get("messages", [])
    ):
        phases_completed.append("exploitation")
    
    # Check for successful exploits
    successful_exploits = [
        e for e in state.get("exploit_results", [])
        if e.get("success", False)
    ]
    
    if successful_exploits:
        phases_completed.append("actions_on_objectives")
    
    return {
        "phases_completed": phases_completed,
        "total_phases": 7,  # Standard cyber kill chain
        "progress_percentage": round(len(phases_completed) / 7 * 100, 1),
        "successful_exploits": len(successful_exploits),
    }


def _compute_statistics(state: RedTeamState) -> dict[str, Any]:
    """Compute mission statistics."""
    messages = state.get("messages", [])
    
    intel_reports = sum(
        1 for msg in messages
        if isinstance(msg, A2AMessage) and msg.type == MessageType.INTELLIGENCE_REPORT
    )
    
    exploit_results = sum(
        1 for msg in messages
        if isinstance(msg, A2AMessage) and msg.type == MessageType.EXPLOIT_RESULT
    )
    
    successful_exploits = sum(
        1 for e in state.get("exploit_results", [])
        if e.get("success", False)
    )
    
    high_confidence_findings = sum(
        1 for f in state.get("recon_results", [])
        if f.get("confidence", 0) >= 0.8
    )
    
    return {
        "total_messages": len(messages),
        "intel_reports": intel_reports,
        "exploit_attempts": exploit_results,
        "successful_exploits": successful_exploits,
        "high_confidence_findings": high_confidence_findings,
        "reflection_count": state.get("reflection_count", 0),
        "errors_count": len(state.get("errors", [])),
    }


def _generate_recommendations(state: RedTeamState) -> list[str]:
    """Generate recommendations based on findings."""
    recommendations = []
    
    # Check for CVE hints
    cve_hints = set()
    for finding in state.get("recon_results", []):
        if finding.get("cve_hint"):
            cve_hints.add(finding["cve_hint"])
    
    if cve_hints:
        recommendations.append(f"Review and patch identified CVEs: {', '.join(cve_hints)}")
    
    # Check for successful exploits
    successful = [e for e in state.get("exploit_results", []) if e.get("success")]
    if successful:
        recommendations.append("CRITICAL: Successful exploits detected - immediate remediation required")
        for exp in successful:
            recommendations.append(f"  - {exp.get('exploit_type', 'Unknown')} on {exp.get('target', 'unknown')}")
    
    # Check for high confidence findings
    high_conf = [f for f in state.get("recon_results", []) if f.get("confidence", 0) >= 0.8]
    if high_conf:
        recommendations.append(f"Review {len(high_conf)} high-confidence reconnaissance findings")
    
    # Check for open ports/services
    for finding in state.get("recon_results", []):
        if "port" in finding.get("asset", "").lower() or "open" in finding.get("finding", "").lower():
            recommendations.append("Review exposed services and close unnecessary ports")
            break
    
    # General recommendations if no specific ones
    if not recommendations:
        recommendations.append("Continue monitoring and periodic security assessments")
    
    return recommendations


def format_report_text(report: dict[str, Any]) -> str:
    """Format the report as human-readable text."""
    lines = []
    
    lines.append("=" * 70)
    lines.append("RED TEAM MISSION REPORT")
    lines.append("=" * 70)
    lines.append("")
    
    # Metadata
    meta = report.get("report_metadata", {})
    lines.append(f"Mission ID: {meta.get('mission_id', 'unknown')}")
    lines.append(f"Generated: {meta.get('generated_at', 'unknown')}")
    lines.append("")
    
    # Mission Summary
    lines.append("-" * 70)
    lines.append("MISSION SUMMARY")
    lines.append("-" * 70)
    summary = report.get("mission_summary", {})
    lines.append(f"Objective: {summary.get('objective', 'N/A')}")
    lines.append(f"Target: {summary.get('target', 'N/A')}")
    lines.append(f"Final Phase: {summary.get('final_phase', 'unknown')}")
    lines.append(f"Iterations: {summary.get('iterations_completed', 0)}/{summary.get('max_iterations', 0)}")
    lines.append(f"Strategy: {summary.get('strategy', 'N/A')[:200]}...")
    lines.append("")
    
    # Kill Chain
    lines.append("-" * 70)
    lines.append("KILL CHAIN PROGRESS")
    lines.append("-" * 70)
    kc = report.get("kill_chain_progress", {})
    lines.append(f"Phases Completed: {', '.join(kc.get('phases_completed', []))}")
    lines.append(f"Progress: {kc.get('progress_percentage', 0)}%")
    lines.append(f"Successful Exploits: {kc.get('successful_exploits', 0)}")
    lines.append("")
    
    # Recon Findings
    lines.append("-" * 70)
    lines.append("RECONNAISSANCE FINDINGS")
    lines.append("-" * 70)
    for i, finding in enumerate(report.get("reconnaissance_findings", []), 1):
        lines.append(f"\n[{i}] {finding.get('asset', 'unknown')}")
        lines.append(f"    Finding: {finding.get('finding', 'N/A')}")
        lines.append(f"    Confidence: {finding.get('confidence', 0):.0%}")
        if finding.get('cve_hint'):
            lines.append(f"    CVE: {finding['cve_hint']}")
        if finding.get('recommended_action'):
            lines.append(f"    Action: {finding['recommended_action']}")
    
    if not report.get("reconnaissance_findings"):
        lines.append("No reconnaissance findings recorded.")
    lines.append("")
    
    # Exploitation Results
    lines.append("-" * 70)
    lines.append("EXPLOITATION RESULTS")
    lines.append("-" * 70)
    for i, result in enumerate(report.get("exploitation_results", []), 1):
        status = "SUCCESS" if result.get("success") else "FAILED"
        lines.append(f"\n[{i}] [{status}] {result.get('exploit_type', 'unknown')}")
        lines.append(f"    Target: {result.get('target', 'unknown')}")
        if result.get('impact'):
            lines.append(f"    Impact: {result['impact']}")
        if result.get('evidence'):
            lines.append(f"    Evidence: {result['evidence'][:200]}...")
    
    if not report.get("exploitation_results"):
        lines.append("No exploitation attempts recorded.")
    lines.append("")
    
    # Statistics
    lines.append("-" * 70)
    lines.append("STATISTICS")
    lines.append("-" * 70)
    stats = report.get("statistics", {})
    lines.append(f"Total Messages: {stats.get('total_messages', 0)}")
    lines.append(f"Intel Reports: {stats.get('intel_reports', 0)}")
    lines.append(f"Exploit Attempts: {stats.get('exploit_attempts', 0)}")
    lines.append(f"Successful Exploits: {stats.get('successful_exploits', 0)}")
    lines.append(f"High Confidence Findings: {stats.get('high_confidence_findings', 0)}")
    lines.append(f"Self-Reflections: {stats.get('reflection_count', 0)}")
    lines.append("")
    
    # Recommendations
    lines.append("-" * 70)
    lines.append("RECOMMENDATIONS")
    lines.append("-" * 70)
    for rec in report.get("recommendations", []):
        lines.append(f"  • {rec}")
    
    if not report.get("recommendations"):
        lines.append("No specific recommendations.")
    lines.append("")
    
    # Errors
    if report.get("errors"):
        lines.append("-" * 70)
        lines.append("ERRORS")
        lines.append("-" * 70)
        for err in report["errors"]:
            lines.append(f"  ! {err}")
        lines.append("")
    
    lines.append("=" * 70)
    lines.append("END OF REPORT")
    lines.append("=" * 70)
    
    return "\n".join(lines)


async def save_report(report: dict[str, Any], output_dir: str = "reports") -> tuple[str, str]:
    """
    Save report to files.
    
    Returns tuple of (json_path, text_path).
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    mission_id = report.get("report_metadata", {}).get("mission_id", "unknown")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = f"mission_{mission_id}_{timestamp}"
    
    # Save JSON
    json_path = output_path / f"{base_name}.json"
    with open(json_path, "w") as f:
        json.dump(report, f, indent=2, default=str)
    logger.info("JSON report saved to %s", json_path)
    
    # Save text
    text_path = output_path / f"{base_name}.txt"
    text_content = format_report_text(report)
    with open(text_path, "w") as f:
        f.write(text_content)
    logger.info("Text report saved to %s", text_path)
    
    return str(json_path), str(text_path)
