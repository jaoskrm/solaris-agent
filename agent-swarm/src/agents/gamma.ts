import { BaseAgent, type AgentConfig } from './base-agent.js';
import type { SwarmEvent } from '../events/types.js';

export interface GammaConfig extends AgentConfig {
  agentType: 'gamma';
  maxRetries?: number;
}

export class GammaAgent extends BaseAgent {
  constructor(config: GammaConfig) {
    super(config);
  }

  async processEvent(event: SwarmEvent): Promise<void> {
    console.log(`[${this.agentId}] Processing event: ${event.type}`, event.payload);
    
    switch (event.type) {
      case 'mission_queued':
        await this.handleMissionQueued(event);
        break;
      case 'waf_duel_started':
        await this.handleWafDuelStarted(event);
        break;
      case 'handoff_requested':
        await this.handleHandoffRequested(event);
        break;
      default:
        console.log(`[${this.agentId}] Unhandled event type: ${event.type}`);
    }
  }

  private async handleMissionQueued(event: SwarmEvent): Promise<void> {
    const { missionId } = event.payload as { missionId: string };
    
    console.log(`[${this.agentId}] Attempting to claim mission: ${missionId}`);
    
    const claimedId = await this.graph.claimMission('gamma', this.agentId);
    
    if (claimedId) {
      console.log(`[${this.agentId}] Claimed mission: ${claimedId}`);
      await this.executeMission(claimedId);
    }
  }

  private async executeMission(missionId: string): Promise<void> {
    console.log(`[${this.agentId}] Executing mission: ${missionId}`);
    
    try {
      const mission = await this.graph.findNodeById(missionId);
      if (!mission) {
        throw new Error('Mission not found');
      }
      
      await this.graph.updateNode(missionId, { status: 'active', started_at: Date.now() });
      
      const result = await this.mockExploitExecution();
      
      await this.graph.updateNode(missionId, { 
        status: 'completed', 
        completed_at: Date.now(),
        result 
      });
      
      await this.emit('exploit_completed', { missionId, result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.graph.updateNode(missionId, { 
        status: 'failed', 
        failed_at: Date.now(),
        error: errorMessage 
      });
      
      await this.emit('exploit_failed', { missionId, error: errorMessage });
    }
  }

  private async mockExploitExecution(): Promise<Record<string, unknown>> {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      findings: [],
      artifacts: [],
      executed_at: Date.now(),
    };
  }

  private async handleWafDuelStarted(event: SwarmEvent): Promise<void> {
    const { duelId, targetId, wafType } = event.payload as {
      duelId: string;
      targetId: string;
      wafType: string;
    };
    
    console.log(`[${this.agentId}] WAF duel started: ${duelId} (${wafType})`);
    
    await this.emit('waf_duel_complete', { duelId, targetId, result: 'bypassed' });
  }

  private async handleHandoffRequested(event: SwarmEvent): Promise<void> {
    const { handoffId, targetAgent } = event.payload as {
      handoffId: string;
      targetAgent: string;
      data: unknown;
    };
    
    console.log(`[${this.agentId}] Handoff requested to ${targetAgent}: ${handoffId}`);
    
    await this.emit('specialist_complete', { handoffId, completed_by: this.agentId });
  }
}
