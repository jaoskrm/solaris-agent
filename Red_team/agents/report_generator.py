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


def _deduplicate_findings(findings: list[dict[str, Any]], key_fields: list[str] = None) -> list[dict[str, Any]]:
    """
    Deduplicate findings based on specified key fields.
    
    Args:
        findings: List of finding dicts
        key_fields: Fields to use for deduplication (default: ['asset', 'finding'])
    
    Returns:
        Deduplicated list of findings
    """
    if key_fields is None:
        key_fields = ["asset", "finding"]
    
    seen = set()
    deduplicated = []
    
    for finding in findings:
        # Create a unique key from the specified fields
        key = tuple(finding.get(field, "") for field in key_fields)
        
        if key not in seen:
            seen.add(key)
            deduplicated.append(finding)
    
    logger.info(f"Deduplicated {len(findings)} findings to {len(deduplicated)}")
    return deduplicated


def _deduplicate_exploits(exploits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Deduplicate exploitation results based on key fields.
    """
    seen = set()
    deduplicated = []
    
    for exploit in exploits:
        # Use target and exploit_type as key
        key = (exploit.get("target", ""), exploit.get("exploit_type", ""), exploit.get("success", False))
        
        if key not in seen:
            seen.add(key)
            deduplicated.append(exploit)
    
    logger.info(f"Deduplicated {len(exploits)} exploits to {len(deduplicated)}")
    return deduplicated


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
    """Extract and format reconnaissance findings with deduplication."""
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
    
    # Deduplicate findings
    return _deduplicate_findings(findings)


def _extract_exploit_results(state: RedTeamState) -> list[dict[str, Any]]:
    """Extract and format exploitation results with deduplication."""
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
    
    # Deduplicate exploits
    return _deduplicate_exploits(results)


def _build_kill_chain_narrative(state: RedTeamState) -> list[dict[str, Any]]:
    """
    Build the kill chain narrative showing how exploits chain together.
    Format: Finding A → Asset B → Exploit C
    """
    narrative = []
    
    # Get discovered credentials for chaining context
    credentials = state.get("discovered_credentials", {})
    
    # Build narrative from exploit results
    exploit_results = state.get("exploit_results", [])
    recon_results = state.get("recon_results", [])
    
    for i, exploit in enumerate(exploit_results):
        if exploit.get("success"):
            # Find related recon finding
            related_finding = None
            for finding in recon_results:
                if finding.get("asset") in exploit.get("target", ""):
                    related_finding = finding
                    break
            
            narrative.append({
                "step": i + 1,
                "phase": "exploitation",
                "finding": related_finding.get("finding", "Unknown vulnerability") if related_finding else "Discovered weakness",
                "asset": exploit.get("target", "Unknown"),
                "exploit_type": exploit.get("exploit_type", "unknown"),
                "impact": exploit.get("impact", ""),
                "evidence": exploit.get("evidence", "")[:200],
                "credentials_discovered": bool(credentials),
            })
    
    return narrative


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
    
    # Installation (credentials/token discovery)
    if state.get("discovered_credentials"):
        phases_completed.append("installation")
    
    # Command & Control (pivot to admin/data endpoints)
    if any(
        e.get("exploit_type") in ["idor", "auth_bypass", "data_exfiltration"]
        for e in state.get("exploit_results", [])
        if e.get("success")
    ):
        phases_completed.append("c2")
    
    # Check for successful exploits
    successful_exploits = [
        e for e in state.get("exploit_results", [])
        if e.get("success", False)
    ]
    
    if successful_exploits:
        phases_completed.append("actions_on_objectives")
    
    # Build narrative
    narrative = _build_kill_chain_narrative(state)
    
    return {
        "phases_completed": phases_completed,
        "total_phases": 7,  # Standard cyber kill chain
        "progress_percentage": round(len(phases_completed) / 7 * 100, 1),
        "successful_exploits": len(successful_exploits),
        "narrative": narrative,
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
    
    # ═══════════════════════════════════════════════════════════════════════
    # VIBECHECK ENTERPRISE SECURITY - PROFESSIONAL REPORT HEADER
    # ═══════════════════════════════════════════════════════════════════════
    lines.append("╔" + "═" * 78 + "╗")
    lines.append("║" + " " * 20 + "VIBECHECK ENTERPRISE SECURITY" + " " * 29 + "║")
    lines.append("║" + " " * 18 + "AUTONOMOUS RED TEAM ASSESSMENT" + " " * 28 + "║")
    lines.append("╠" + "═" * 78 + "╣")
    lines.append("║  CONFIDENTIAL - PROPRIETARY SECURITY INTELLIGENCE" + " " * 38 + "║")
    lines.append("╚" + "═" * 78 + "╝")
    lines.append("")
    
    # Metadata
    meta = report.get("report_metadata", {})
    summary = report.get("mission_summary", {})
    lines.append(f"Report ID:      {meta.get('mission_id', 'unknown')}")
    lines.append(f"Generated:      {meta.get('generated_at', 'unknown')}")
    lines.append(f"Target:         {summary.get('target', 'N/A')}")
    lines.append(f"Classification: CONFIDENTIAL - EXECUTIVE REVIEW")
    lines.append("")
    
    # ═══════════════════════════════════════════════════════════════════════
    # CYBER-THREAT LANDSCAPE SUMMARY
    # ═══════════════════════════════════════════════════════════════════════
    lines.append("┌" + "─" * 78 + "┐")
    lines.append("│" + " " * 25 + "CYBER-THREAT LANDSCAPE" + " " * 31 + "│")
    lines.append("└" + "─" * 78 + "┘")
    lines.append("")
    
    kc = report.get("kill_chain_progress", {})
    stats = report.get("statistics", {})
    
    lines.append(f"  ► Mission Objective: {summary.get('objective', 'N/A')}")
    lines.append(f"  ► Kill Chain Progress: {kc.get('progress_percentage', 0)}% ({', '.join(kc.get('phases_completed', []))})")
    lines.append(f"  ► Attack Vectors Tested: {stats.get('exploit_attempts', 0)}")
    lines.append(f"  ► Successful Compromises: {stats.get('successful_exploits', 0)}")
    lines.append(f"  ► Critical Findings: {stats.get('high_confidence_findings', 0)}")
    lines.append(f"  ► Risk Level: {'HIGH' if stats.get('successful_exploits', 0) > 0 else 'MEDIUM' if stats.get('exploit_attempts', 0) > 0 else 'LOW'}")
    lines.append("")
    
    # ═══════════════════════════════════════════════════════════════════════
    # EXECUTIVE SUMMARY
    # ═══════════════════════════════════════════════════════════════════════
    lines.append("=" * 80)
    lines.append("EXECUTIVE SUMMARY")
    lines.append("=" * 80)
    lines.append("")
    successful_exploits = stats.get('successful_exploits', 0)
    if successful_exploits > 0:
        lines.append(f"⚠️  CRITICAL: {successful_exploits} successful exploitation(s) confirmed. Immediate")
        lines.append("   remediation is required to prevent unauthorized access and data exfiltration.")
    else:
        lines.append("✓  No successful exploitations detected during this assessment period.")
        lines.append("   However, continued vigilance and defense hardening are recommended.")
    lines.append("")
    lines.append(f"Strategy: {summary.get('strategy', 'N/A')[:250]}...")
    lines.append("")
    
    # ═══════════════════════════════════════════════════════════════════════
    # DETAILED FINDINGS
    # ═══════════════════════════════════════════════════════════════════════
    lines.append("-" * 80)
    lines.append("MISSION DETAILS")
    lines.append("-" * 80)
    lines.append(f"Final Phase: {summary.get('final_phase', 'unknown')}")
    lines.append(f"Iterations Completed: {summary.get('iterations_completed', 0)}/{summary.get('max_iterations', 0)}")
    lines.append("")
    
    # Kill Chain
    lines.append("-" * 80)
    lines.append("KILL CHAIN PROGRESS")
    lines.append("-" * 80)
    kc = report.get("kill_chain_progress", {})
    lines.append(f"  Reconnaissance:     {'✓ COMPLETE' if 'reconnaissance' in kc.get('phases_completed', []) else '○ PENDING'}")
    lines.append(f"  Weaponization:      {'✓ COMPLETE' if 'weaponization' in kc.get('phases_completed', []) else '○ PENDING'}")
    lines.append(f"  Exploitation:       {'✓ COMPLETE' if 'exploitation' in kc.get('phases_completed', []) else '○ PENDING'}")
    lines.append(f"  Installation:       {'✓ COMPLETE' if 'installation' in kc.get('phases_completed', []) else '○ PENDING'}")
    lines.append(f"  C2:                 {'✓ COMPLETE' if 'c2' in kc.get('phases_completed', []) else '○ PENDING'}")
    lines.append(f"  Actions on Obj:     {'✓ COMPLETE' if 'actions_on_objectives' in kc.get('phases_completed', []) else '○ PENDING'}")
    lines.append(f"  Overall Progress:   {kc.get('progress_percentage', 0)}%")
    lines.append("")
    
    # ═══════════════════════════════════════════════════════════════════════
    # KILL CHAIN NARRATIVE
    # ═══════════════════════════════════════════════════════════════════════
    lines.append("=" * 80)
    lines.append("KILL CHAIN NARRATIVE (Attack Progression)")
    lines.append("=" * 80)
    lines.append("")
    
    narrative = kc.get("narrative", [])
    if narrative:
        lines.append("  Attack Chain: Finding → Asset → Exploit → Impact")
        lines.append("")
        for step in narrative:
            lines.append(f"  Step {step['step']}: {step['phase'].upper()}")
            lines.append(f"    ├─ Finding: {step['finding'][:80]}...")
            lines.append(f"    ├─ Asset:   {step['asset']}")
            lines.append(f"    ├─ Vector:  {step['exploit_type'].upper()}")
            if step.get('credentials_discovered'):
                lines.append(f"    └─ Result:  ✓ SUCCESS (Credentials Discovered)")
            else:
                lines.append(f"    └─ Result:  ✓ SUCCESS")
            if step.get('impact'):
                lines.append(f"       Impact:  {step['impact'][:100]}")
            lines.append("")
        
        # Show chain summary
        if len(narrative) > 1:
            chain = " → ".join([s['exploit_type'].upper() for s in narrative])
            lines.append(f"  Chain Summary: {chain}")
            lines.append("")
    else:
        lines.append("  No successful kill chain progression recorded.")
    lines.append("")
    
    # Recon Findings
    lines.append("-" * 80)
    lines.append("RECONNAISSANCE FINDINGS")
    lines.append("-" * 80)
    for i, finding in enumerate(report.get("reconnaissance_findings", []), 1):
        lines.append(f"\n  [{i}] ASSET: {finding.get('asset', 'unknown')}")
        lines.append(f"      Finding:     {finding.get('finding', 'N/A')}")
        lines.append(f"      Confidence:  {finding.get('confidence', 0):.0%}")
        if finding.get('cve_hint'):
            lines.append(f"      ⚠️ CVE:       {finding['cve_hint']}")
        if finding.get('recommended_action'):
            lines.append(f"      Action:      {finding['recommended_action']}")
    
    if not report.get("reconnaissance_findings"):
        lines.append("  No reconnaissance findings recorded.")
    lines.append("")
    
    # Exploitation Results
    lines.append("-" * 80)
    lines.append("EXPLOITATION RESULTS")
    lines.append("-" * 80)
    for i, result in enumerate(report.get("exploitation_results", []), 1):
        status = "✓ SUCCESS" if result.get("success") else "✗ FAILED"
        lines.append(f"\n  [{i}] [{status}] {result.get('exploit_type', 'unknown').upper()}")
        lines.append(f"      Target:   {result.get('target', 'unknown')}")
        if result.get('impact'):
            lines.append(f"      Impact:   {result['impact']}")
        if result.get('evidence'):
            lines.append(f"      Evidence: {result['evidence'][:200]}...")
    
    if not report.get("exploitation_results"):
        lines.append("  No exploitation attempts recorded.")
    lines.append("")
    
    # Statistics
    lines.append("-" * 80)
    lines.append("MISSION STATISTICS")
    lines.append("-" * 80)
    stats = report.get("statistics", {})
    lines.append(f"  Total Messages:          {stats.get('total_messages', 0)}")
    lines.append(f"  Intelligence Reports:    {stats.get('intel_reports', 0)}")
    lines.append(f"  Exploit Attempts:        {stats.get('exploit_attempts', 0)}")
    lines.append(f"  Successful Exploits:     {stats.get('successful_exploits', 0)}")
    lines.append(f"  High Confidence Findings: {stats.get('high_confidence_findings', 0)}")
    lines.append("")
    
    # ═══════════════════════════════════════════════════════════════════════
    # RECOMMENDATIONS
    # ═══════════════════════════════════════════════════════════════════════
    lines.append("=" * 80)
    lines.append("PRIORITY REMEDIATION RECOMMENDATIONS")
    lines.append("=" * 80)
    lines.append("")
    for i, rec in enumerate(report.get("recommendations", []), 1):
        prefix = "🚨" if "CRITICAL" in rec else "⚠️" if "immediate" in rec.lower() else "•"
        lines.append(f"  {prefix} {rec}")
    
    if not report.get("recommendations"):
        lines.append("  No critical recommendations at this time.")
    lines.append("")
    
    # Errors
    if report.get("errors"):
        lines.append("-" * 80)
        lines.append("SYSTEM ERRORS")
        lines.append("-" * 80)
        for err in report["errors"]:
            lines.append(f"  ! {err}")
        lines.append("")
    
    # ═══════════════════════════════════════════════════════════════════════
    # FOOTER
    # ═══════════════════════════════════════════════════════════════════════
    lines.append("")
    lines.append("╔" + "═" * 78 + "╗")
    lines.append("║" + " " * 10 + "© 2025 VibeCheck Enterprise Security - All Rights Reserved" + " " * 10 + "║")
    lines.append("║" + " " * 8 + "This report contains confidential security information." + " " * 13 + "║")
    lines.append("║" + " " * 8 + "Distribution limited to authorized personnel only." + " " * 18 + "║")
    lines.append("╚" + "═" * 78 + "╝")
    lines.append("")
    lines.append("Report Generated by VibeCheck Autonomous Red Team Platform")
    lines.append("For inquiries: security@vibecheck.enterprise")
    lines.append("")
    lines.append("=" * 80)
    lines.append("END OF REPORT")
    lines.append("=" * 80)
    
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
