import { BaseAgent, type AgentConfig } from './base-agent.js';
import type { SwarmEvent } from '../events/types.js';

export interface AlphaConfig extends AgentConfig {
  agentType: 'alpha';
}

export class AlphaAgent extends BaseAgent {
  constructor(config: AlphaConfig) {
    super(config);
  }

  async processEvent(event: SwarmEvent): Promise<void> {
    console.log(`[${this.agentId}] Processing event: ${event.type}`, event.payload);

    switch (event.type) {
      case 'recon_complete':
        await this.handleReconComplete(event);
        break;
      case 'scan_initiated':
        await this.handleScanInitiated(event);
        break;
      case 'port_discovered':
        await this.handlePortDiscovered(event);
        break;
      case 'service_identified':
        await this.handleServiceIdentified(event);
        break;
      default:
        console.log(`[${this.agentId}] Unhandled event type: ${event.type}`);
    }
  }

  private async handleReconComplete(event: SwarmEvent): Promise<void> {
    const { targetId, scanResults } = event.payload as {
      targetId: string;
      scanResults: unknown;
    };
    console.log(`[${this.agentId}] Recon complete for target: ${targetId}`);
    await this.emit('finding_written', { targetId, type: 'recon', data: scanResults });
  }

  private async handleScanInitiated(event: SwarmEvent): Promise<void> {
    const { targetId, scanType } = event.payload as {
      targetId: string;
      scanType: string;
    };
    console.log(`[${this.agentId}] Scan initiated for target: ${targetId} (${scanType})`);
  }

  private async handlePortDiscovered(event: SwarmEvent): Promise<void> {
    const { targetId, port, protocol } = event.payload as {
      targetId: string;
      port: number;
      protocol: string;
    };
    console.log(`[${this.agentId}] Port discovered: ${port}/${protocol} on ${targetId}`);
    await this.emit('finding_written', { targetId, type: 'port', port, protocol });
  }

  private async handleServiceIdentified(event: SwarmEvent): Promise<void> {
    const { targetId, service, version } = event.payload as {
      targetId: string;
      service: string;
      version?: string;
    };
    console.log(`[${this.agentId}] Service identified: ${service}${version ? ` ${version}` : ''} on ${targetId}`);
    await this.emit('finding_written', { targetId, type: 'service', service, version });
  }
}
