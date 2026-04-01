import type { SwarmEventType } from './types.js';

export interface AgentSubscription {
  agentId: string;
  agentType: string;
  events: SwarmEventType[];
}

export const AGENT_SUBSCRIPTIONS: Record<string, SwarmEventType[]> = {
  'commander': [
    'mission_queued',
    'mission_verified',
    'mission_authorized',
    'exploit_completed',
    'exploit_failed',
    'swarm_complete',
    'brief_ready',
  ],
  'verifier': [
    'finding_written',
    'credential_found',
    'mission_verified',
    'enrichment_requested',
  ],
  'gamma': [
    'mission_queued',
    'exploit_completed',
    'exploit_failed',
    'waf_duel_started',
    'waf_duel_complete',
    'handoff_requested',
  ],
};

export function getSubscriptions(agentType: string): SwarmEventType[] {
  return AGENT_SUBSCRIPTIONS[agentType] || [];
}

export function getAllSubscribedEvents(): SwarmEventType[] {
  const allEvents = new Set<SwarmEventType>();
  for (const events of Object.values(AGENT_SUBSCRIPTIONS)) {
    for (const event of events) {
      allEvents.add(event);
    }
  }
  return Array.from(allEvents);
}
