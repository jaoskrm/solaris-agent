import { EventBus } from '../events/bus.js';
import { getSubscriptions } from '../events/subscriptions.js';
import { getFalkorDB, type FalkorDBClient } from '../infra/falkordb.js';
import type { SwarmEvent, SwarmEventType } from '../events/types.js';

export interface AgentConfig {
  agentId: string;
  agentType: 'commander' | 'verifier' | 'gamma';
  pollInterval?: number;
}

export abstract class BaseAgent {
  protected agentId: string;
  protected agentType: string;
  protected graph: FalkorDBClient;
  protected eventBus: EventBus;
  protected pollInterval: number;
  protected running = false;
  protected pollingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: AgentConfig) {
    this.agentId = config.agentId;
    this.agentType = config.agentType;
    this.graph = getFalkorDB();
    this.eventBus = new EventBus();
    this.pollInterval = config.pollInterval || 5000;
  }

  abstract processEvent(event: SwarmEvent): Promise<void>;

  protected getSubscriptions(): SwarmEventType[] {
    return getSubscriptions(this.agentType);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    
    console.log(`[${this.agentId}] Starting ${this.agentType} agent...`);
    
    await this.graph.connect();
    
    this.pollingTimer = setInterval(() => {
      this.poll().catch(console.error);
    }, this.pollInterval);
    
    console.log(`[${this.agentId}] Agent started, polling every ${this.pollInterval}ms`);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    await this.graph.close();
    this.eventBus.close();
    
    console.log(`[${this.agentId}] Agent stopped`);
  }

  protected async poll(): Promise<void> {
    try {
      const events = await this.eventBus.consume(
        this.agentId,
        this.getSubscriptions()
      );
      
      for (const event of events) {
        try {
          await this.processEvent(event);
        } catch (error) {
          console.error(`[${this.agentId}] Error processing event ${event.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`[${this.agentId}] Error polling events:`, error);
    }
  }

  protected async emit(type: SwarmEventType, payload: Record<string, unknown>): Promise<string> {
    return this.eventBus.emit(type, payload, this.agentId);
  }
}
