import { EventBus } from '../events/bus.js';
import { getSubscriptions } from '../events/subscriptions.js';
import { getFalkorDB, type FalkorDBClient } from '../infra/falkordb.js';
import type { SwarmEvent, SwarmEventType } from '../events/types.js';
import { AgentState, AGENT_INITIAL_STATES, canTransition } from './state.js';

export interface AgentConfig {
  agentId: string;
  agentType: string;
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

  protected state: AgentState = 'DORMANT';
  protected stateChangedAt: number = Date.now();
  protected errorMessage: string | null = null;

  protected readonly COOLDOWN_MS = 2000;
  protected readonly ERROR_BACKOFF_MS = 30000;

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

  protected transitionTo(newState: AgentState, reason?: string): void {
    if (!canTransition(this.state, newState)) {
      console.warn(`[${this.agentId}] Invalid transition ${this.state}→${newState} (${reason || 'no reason'})`);
      return;
    }
    const oldState = this.state;
    this.state = newState;
    this.stateChangedAt = Date.now();
    console.log(`[${this.agentId}] State: ${oldState} → ${newState}${reason ? ` (${reason})` : ''}`);
  }

  protected isStandby(): boolean {
    return this.state === 'STANDBY';
  }

  protected isActive(): boolean {
    return this.state === 'ACTIVE';
  }

  protected isDormant(): boolean {
    return this.state === 'DORMANT';
  }

  protected isError(): boolean {
    return this.state === 'ERROR';
  }

  protected handleError(error: unknown): void {
    this.errorMessage = error instanceof Error ? error.message : String(error);
    if (this.state !== 'ERROR') {
      this.transitionTo('ERROR', this.errorMessage);
      setTimeout(() => {
        this.transitionTo('DORMANT', 'error backoff complete');
      }, this.ERROR_BACKOFF_MS);
    }
  }

  protected async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(`[${this.agentId}] Starting ${this.agentType} agent...`);

    await this.graph.connect();

    const initialState = AGENT_INITIAL_STATES[this.agentType] || 'DORMANT';
    this.transitionTo(initialState, 'initial');

    if (initialState !== 'DORMANT') {
      this.pollingTimer = setInterval(() => {
        this.poll().catch(console.error);
      }, this.pollInterval);
    }

    console.log(`[${this.agentId}] Agent started in ${initialState} state, polling every ${this.pollInterval}ms`);
  }

  protected async stop(): Promise<void> {
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
      if (this.state === 'DORMANT' || this.state === 'ERROR') {
        return;
      }

      const events = await this.eventBus.consume(
        this.agentId,
        this.getSubscriptions()
      );

      if (events.length > 0 && this.state === 'STANDBY') {
        this.transitionTo('ACTIVE');
      }

      for (const event of events) {
        try {
          await this.processEvent(event);
        } catch (error) {
          console.error(`[${this.agentId}] Error processing event ${event.id}:`, error);
          this.handleError(error);
        }
      }

      if (this.state === 'ACTIVE' && events.length === 0) {
        this.transitionTo('COOLDOWN');
        setTimeout(() => {
          this.transitionAfterCooldown();
        }, this.COOLDOWN_MS);
      }
    } catch (error) {
      console.error(`[${this.agentId}] Poll error:`, error);
      this.handleError(error);
    }
  }

  private async transitionAfterCooldown(): Promise<void> {
    if (this.state !== 'COOLDOWN') return;

    const count = await this.eventBus.getPendingCount(this.getSubscriptions());
    if (count > 0) {
      this.transitionTo('STANDBY');
    } else {
      const initialState = AGENT_INITIAL_STATES[this.agentType] || 'DORMANT';
      this.transitionTo(initialState);
    }
  }

  protected async emit(type: SwarmEventType, payload: Record<string, unknown>): Promise<string> {
    return this.eventBus.emit(type, payload, this.agentId);
  }
}
