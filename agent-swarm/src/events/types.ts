export type SwarmEventType =
  | "finding_written"
  | "finding_validated"
  | "credential_found"
  | "credential_promoted"
  | "mission_queued"
  | "mission_verified"
  | "mission_authorized"
  | "exploit_completed"
  | "exploit_failed"
  | "enrichment_requested"
  | "rce_confirmed"
  | "swarm_complete"
  | "brief_ready"
  | "waf_duel_started"
  | "waf_duel_complete"
  | "handoff_requested"
  | "specialist_activated"
  | "specialist_complete"
  | "belief_updated";

export interface SwarmEvent {
  id: string;
  type: SwarmEventType;
  payload: Record<string, unknown>;
  consumed: boolean;
  consumed_by?: string;
  consumed_at?: number;
  created_at: number;
  created_by: string;
}

export const EventTTL: Record<SwarmEventType, number | null> = {
  swarm_complete: null,
  finding_validated: 3600000,
  mission_authorized: 3600000,
  exploit_completed: 3600000,
  exploit_failed: 86400000,
  brief_ready: 1800000,
  finding_written: 600000,
  credential_found: 600000,
  credential_promoted: 600000,
  mission_queued: 600000,
  mission_verified: 600000,
  enrichment_requested: 600000,
  rce_confirmed: 600000,
  waf_duel_started: 600000,
  waf_duel_complete: 600000,
  handoff_requested: 600000,
  specialist_activated: 600000,
  specialist_complete: 600000,
  belief_updated: 600000,
};
