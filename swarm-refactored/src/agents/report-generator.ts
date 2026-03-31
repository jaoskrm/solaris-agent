import type { RedTeamState, Report, KillChainPhase, Phase } from '../types/index.js';
import { supabaseClient } from '../core/supabase-client.js';
import { redisBus } from '../core/redis-bus.js';
import { v4 as uuidv4 } from 'uuid';

function formatReportText(report: Report): string {
  const lines: string[] = [
    '='.repeat(60),
    'RED TEAM MISSION REPORT',
    '='.repeat(60),
    '',
    `Mission ID: ${report.report_metadata.mission_id}`,
    `Generated: ${report.report_metadata.generated_at}`,
    `Version: ${report.report_metadata.report_version}`,
    '',
    '-'.repeat(60),
    'MISSION SUMMARY',
    '-'.repeat(60),
    `Objective: ${report.mission_summary.objective}`,
    `Target: ${report.mission_summary.target}`,
    `Final Phase: ${report.mission_summary.final_phase}`,
    `Iterations: ${report.mission_summary.iterations_completed}/${report.mission_summary.max_iterations}`,
    `Strategy: ${report.mission_summary.strategy}`,
    '',
    '-'.repeat(60),
    'KILL CHAIN PROGRESS',
    '-'.repeat(60),
    `Progress: ${report.kill_chain_progress.progress_percentage.toFixed(1)}%`,
    `Phases Completed: ${report.kill_chain_progress.phases_completed.join(', ')}`,
    `Successful Exploits: ${report.kill_chain_progress.successful_exploits}`,
    '',
  ];

  if (report.kill_chain_progress.narrative.length > 0) {
    lines.push('NARRATIVE:');
    for (const step of report.kill_chain_progress.narrative) {
      lines.push(`  ${step.step}. [${step.phase.toUpperCase()}] ${step.finding}`);
      lines.push(`     Impact: ${step.impact}`);
      lines.push(`     Evidence: ${step.evidence.slice(0, 100)}...`);
    }
  }

  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('STATISTICS');
  lines.push('-'.repeat(60));
  lines.push(`Total Messages: ${report.statistics.total_messages}`);
  lines.push(`Intel Reports: ${report.statistics.intel_reports}`);
  lines.push(`Exploit Attempts: ${report.statistics.exploit_attempts}`);
  lines.push(`Successful Exploits: ${report.statistics.successful_exploits}`);
  lines.push(`High Confidence Findings: ${report.statistics.high_confidence_findings}`);
  lines.push(`Reflection Count: ${report.statistics.reflection_count}`);
  lines.push(`Errors: ${report.statistics.errors_count}`);

  if (report.recommendations.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('RECOMMENDATIONS');
    lines.push('-'.repeat(60));
    for (const rec of report.recommendations) {
      lines.push(`  • ${rec}`);
    }
  }

  if (report.errors.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('ERRORS');
    lines.push('-'.repeat(60));
    for (const err of report.errors) {
      lines.push(`  • ${err}`);
    }
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

async function saveReportToFile(report: Report, missionId: string): Promise<string | null> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const reportsDir = path.join(process.cwd(), 'reports');
    await fs.mkdir(reportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `mission-${missionId.slice(0, 8)}-${timestamp}.txt`;
    const filePath = path.join(reportsDir, fileName);

    const textContent = formatReportText(report);
    await fs.writeFile(filePath, textContent, 'utf-8');

    console.info(`Report saved to: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('Failed to save report:', error);
    return null;
  }
}

export async function report_generation_node(
  state: RedTeamState
): Promise<Partial<RedTeamState>> {
  console.info('='.repeat(60));
  console.info('MISSION COMPLETE - Generating Report');
  console.info('='.repeat(60));

  const successfulExploits = state.exploit_results.filter((e) => e.success);
  const highConfFindings = state.recon_results.filter((f) => f.confidence >= 0.8);

  const phasesCompleted: KillChainPhase[] = [];
  if (state.recon_results.length > 0) phasesCompleted.push('reconnaissance');
  if (state.current_tasks.length > 0) phasesCompleted.push('weaponization');
  if (state.exploit_results.length > 0) phasesCompleted.push('exploitation');
  if (successfulExploits.length > 0) phasesCompleted.push('installation');
  if (successfulExploits.some((e) => ['idor', 'auth_bypass'].includes(e.exploit_type))) {
    phasesCompleted.push('c2');
    phasesCompleted.push('actions_on_objectives');
  }

  const recommendations: string[] = [];
  if (successfulExploits.length > 0) {
    recommendations.push('CRITICAL: Successful exploits detected - immediate remediation required');
    for (const exp of successfulExploits.slice(0, 5)) {
      recommendations.push(`  - ${exp.exploit_type} on ${exp.target}`);
    }
  }
  if (highConfFindings.length > 0) {
    recommendations.push(`Review ${highConfFindings.length} high-confidence reconnaissance findings`);
  }
  if (recommendations.length === 0) {
    recommendations.push('Continue monitoring and periodic security assessments');
  }

  const report: Report = {
    report_metadata: {
      generated_at: new Date().toISOString(),
      mission_id: state.mission_id,
      report_version: '1.0',
    },
    mission_summary: {
      objective: state.objective,
      target: state.target,
      final_phase: state.phase,
      iterations_completed: state.iteration,
      max_iterations: state.max_iterations,
      strategy: state.strategy,
    },
    reconnaissance_findings: state.recon_results,
    exploitation_results: state.exploit_results,
    kill_chain_progress: {
      phases_completed: phasesCompleted,
      total_phases: 7,
      progress_percentage: (phasesCompleted.length / 7) * 100,
      successful_exploits: successfulExploits.length,
      narrative: successfulExploits.map((exp, i) => ({
        step: i + 1,
        phase: 'exploitation',
        finding: `${exp.exploit_type} on ${exp.target}`,
        asset: exp.target,
        exploit_type: exp.exploit_type,
        impact: exp.impact || 'Exploitation successful',
        evidence: exp.evidence.slice(0, 200),
        credentials_discovered: false,
      })),
    },
    statistics: {
      total_messages: state.messages.length,
      intel_reports: state.messages.filter((m) => m.type === 'INTELLIGENCE_REPORT').length,
      exploit_attempts: state.exploit_results.length,
      successful_exploits: successfulExploits.length,
      high_confidence_findings: highConfFindings.length,
      reflection_count: state.reflection_count,
      errors_count: state.errors.length,
    },
    recommendations,
    errors: state.errors,
  };

  const textContent = formatReportText(report);
  console.log('\n' + textContent);

  let reportPath: string | null = null;
  try {
    reportPath = await saveReportToFile(report, state.mission_id);
    console.info(`Report saved to: ${reportPath}`);
  } catch (error) {
    console.error('Failed to save report:', error);
  }

  try {
    await supabaseClient.updateMissionStatus(state.mission_id, 'completed');

    for (const agentId of ['commander', 'alpha', 'gamma', 'critic']) {
      await supabaseClient.updateAgentState(
        state.mission_id,
        agentId,
        agentId,
        'complete',
        { iteration: state.iteration, task: 'mission_complete' }
      );
    }

    await supabaseClient.logSwarmEvent({
      mission_id: state.mission_id,
      event_type: 'agent_complete',
      agent_name: 'commander',
      title: 'Mission completed — report generated',
      stage: 'reporting',
      iteration: state.iteration,
    });
  } catch (error) {
    console.debug(`Failed to update final mission status: ${error}`);
  }

  await redisBus.disconnect();

  return {
    phase: 'complete' as Phase,
    report,
    report_path: reportPath,
  };
}
