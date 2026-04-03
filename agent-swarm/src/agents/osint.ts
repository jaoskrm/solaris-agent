import { BaseAgent, type AgentConfig } from './base-agent.js';
import type { SwarmEvent } from '../events/types.js';

export interface OsintConfig extends AgentConfig {
  agentType: 'osint';
}

export class OsintAgent extends BaseAgent {
  constructor(config: OsintConfig) {
    super(config);
  }

  async processEvent(event: SwarmEvent): Promise<void> {
    console.log(`[${this.agentId}] Processing event: ${event.type}`, event.payload);

    switch (event.type) {
      case 'mission_queued':
        await this.handleMissionQueued(event);
        break;
      case 'enrichment_requested':
        await this.handleEnrichmentRequested(event);
        break;
      case 'exploit_failed':
        await this.handleExploitFailed(event);
        break;
      case 'waf_duel_started':
        await this.handleWafDuelStarted(event);
        break;
      default:
        console.log(`[${this.agentId}] Unhandled event type: ${event.type}`);
    }
  }

  private async handleMissionQueued(event: SwarmEvent): Promise<void> {
    const { missionId, target } = event.payload as { missionId: string; target: string };
    console.log(`[${this.agentId}] OSINT mission queued: ${missionId} for target: ${target}`);

    const osintData = await this.collectOsint(target);
    await this.graph.updateNode(missionId, { osint_data: osintData });
    await this.emit('finding_written', { missionId, type: 'osint', data: osintData });
  }

  private async collectOsint(target: string): Promise<Record<string, unknown>> {
    console.log(`[${this.agentId}] Collecting OSINT for: ${target}`);
    return {
      target,
      collected_at: Date.now(),
      domains: [],
      emails: [],
      breaches: [],
      leaks: [],
    };
  }

  private async handleEnrichmentRequested(event: SwarmEvent): Promise<void> {
    const { targetId, enrichmentType } = event.payload as {
      targetId: string;
      enrichmentType: string;
    };
    console.log(`[${this.agentId}] Enrichment requested: ${enrichmentType} for ${targetId}`);

    const enriched = await this.enrichTarget(targetId, enrichmentType);
    await this.emit('finding_written', { targetId, type: 'enrichment', enrichmentType, data: enriched });
  }

  private async enrichTarget(targetId: string, enrichmentType: string): Promise<Record<string, unknown>> {
    console.log(`[${this.agentId}] Enriching ${targetId} with ${enrichmentType}`);
    return { targetId, enrichmentType, enriched_at: Date.now() };
  }

  private async handleExploitFailed(event: SwarmEvent): Promise<void> {
    const { error, target } = event.payload as {
      missionId: string;
      error: string;
      target: string;
    };
    console.log(`[${this.agentId}] Exploit failed for ${target}: ${error}`);
    await this.collectFailureIntel(target, error);
  }

  private async collectFailureIntel(target: string, error: string): Promise<void> {
    console.log(`[${this.agentId}] Collecting failure intelligence for: ${target}`);
    await this.emit('finding_written', { target, type: 'failure_intel', error });
  }

  private async handleWafDuelStarted(event: SwarmEvent): Promise<void> {
    const { duelId, targetId, wafType } = event.payload as {
      duelId: string;
      targetId: string;
      wafType: string;
    };
    console.log(`[${this.agentId}] WAF duel started: ${duelId} - gathering ${wafType} intel`);
    const wafIntel = await this.gatherWafIntel(targetId, wafType);
    await this.emit('finding_written', { duelId, type: 'waf_intel', data: wafIntel });
  }

  private async gatherWafIntel(targetId: string, wafType: string): Promise<Record<string, unknown>> {
    console.log(`[${this.agentId}] Gathering WAF intel for ${targetId} (${wafType})`);
    return { targetId, wafType, gathered_at: Date.now() };
  }
}
