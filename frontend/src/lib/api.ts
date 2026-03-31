/**
 * Swarm Module API
 * Connects frontend to VibeCheck backend for:
 * - Blue Team scan operations
 * - Red Team swarm visualization
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-api-key';

// Log API configuration for debugging (only in development)
if (import.meta.env.DEV) {
  console.log('[API] Configuration:', {
    baseUrl: API_BASE,
    environment: import.meta.env.MODE,
    envApiUrl: import.meta.env.VITE_API_URL,
  });
}

// Export API configuration for external use
export const getApiConfiguration = () => ({
  baseUrl: API_BASE,
  environment: import.meta.env.MODE,
  isProduction: import.meta.env.PROD,
  isDevelopment: import.meta.env.DEV,
});

class ApiError extends Error {
  constructor(
    message: string,
    public isConnectionError: boolean = false,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: `HTTP ${response.status}: ${response.statusText}`,
      }));
      throw new ApiError(error.detail || 'An error occurred', false, response.status);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const isLocalhost = API_BASE.includes('localhost');
      const message = isLocalhost 
        ? `Cannot connect to API server at ${API_BASE}. Please ensure the VibeCheck backend is running on port 8000.`
        : `Cannot connect to API server at ${API_BASE}. Please check your network connection and API configuration.`;
      
      throw new ApiError(message, true);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error instanceof Error ? error.message : 'Unknown error');
  }
}

// ============================================================
// Types
// ============================================================

export interface AgentStateResponse {
  agents: {
    id: string;
    agent_id: string;
    agent_name: string;
    agent_team: string;
    status: string;
    iter: string | null;
    task: string | null;
    last_updated: string;
    created_at: string;
  }[];
}

export interface SwarmFinding {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  finding_type: string | null;
  source: string | null;
  target: string | null;
  endpoint: string | null;
  confirmed: boolean;
  agent_name: string | null;
  cve_id: string | null;
  created_at: string;
  exploit_attempt_id?: string;
  agent_iteration?: number;
  confidence_score?: number;
}

export type SwarmFindingResponse = SwarmFinding[];

export interface SwarmMission {
  id: string;
  target: string;
  objective?: string;
  mode?: string;
  status: string;
  progress: number;
  current_phase?: string;
  iteration: number;
  findings?: Record<string, unknown>[];
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface SwarmMissionList {
  missions: SwarmMission[];
  total: number;
}

export interface SwarmEvent {
  id: string;
  event_type: string;
  agent_name: string;
  stage: string | null;
  title: string;
  description: string | null;
  success: boolean | null;
  error_type: string | null;
  created_at: string;
  iteration: number | null;
}

export interface SwarmEventsResponse {
  events: SwarmEvent[];
}

export interface SwarmExploit {
  id: string;
  exploit_type: string;
  target_url: string;
  method: string;
  payload?: string;
  tool_used?: string;
  command_executed?: string;
  success: boolean;
  response_code: number | null;
  exit_code: number | null;
  error_type: string | null;
  error_message?: string;
  stdout?: string;
  stderr?: string;
  evidence?: Record<string, any>;
  execution_time_ms: number | null;
  created_at: string;
}

export type SwarmExploitsResponse = SwarmExploit[];

// ============================================================
// Mission Functions
// ============================================================

export interface StartMissionRequest {
  target: string;
  objective?: string;
  mode?: 'live' | 'static' | 'repo';
  repo_url?: string;
  auto_deploy?: boolean;
}

export interface StartMissionResponse {
  mission_id: string;
  status: string;
  target: string;
}

export async function triggerSwarmMission(request: StartMissionRequest): Promise<StartMissionResponse> {
  return fetchJson<StartMissionResponse>('/v0/swarm/trigger', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getSwarmMission(missionId: string): Promise<SwarmMission> {
  return fetchJson<SwarmMission>(`/v0/swarm/${missionId}`);
}

export async function getSwarmMissions(limit: number = 20, offset: number = 0): Promise<SwarmMissionList> {
  return fetchJson<SwarmMissionList>(`/v0/swarm/missions?limit=${limit}&offset=${offset}`);
}

/**
 * Get the most recent swarm mission (convenience function)
 */
export async function getLatestSwarmMission(): Promise<SwarmMission | null> {
  const result = await fetchJson<{missions: SwarmMission[]}>('/v0/swarm/missions?limit=1&offset=0');
  return result.missions.length > 0 ? result.missions[0] : null;
}

// ============================================================
// Agent State Functions
// ============================================================

// Note: Backend returns array directly, not {agents: [...]} object
export async function getSwarmAgentStates(missionId: string): Promise<AgentStateResponse | any[]> {
  return fetchJson<AgentStateResponse | any[]>(`/v0/swarm/${missionId}/agents`);
}

// ============================================================
// Event Functions
// ============================================================

// Note: Backend returns array directly, not {events: [...]} object
export async function getSwarmEvents(missionId: string, limit: number = 100, agentName?: string): Promise<SwarmEventsResponse | any[]> {
  let url = `/v0/swarm/${missionId}/events?limit=${limit}`;
  if (agentName) {
    url += `&agent=${encodeURIComponent(agentName)}`;
  }
  return fetchJson<SwarmEventsResponse | any[]>(url);
}

export interface SwarmTimelineEvent {
  id: string;
  mission_id: string;
  event_type: string;
  agent_name: string;
  stage: string | null;
  title: string;
  description: string | null;
  success: boolean | null;
  error_type: string | null;
  created_at: string;
  iteration: number | null;
  exploit_type?: string;
  target_url?: string;
}

export async function getSwarmTimelineEvents(
  missionId: string, 
  limit: number = 100, 
  agentName?: string,
  eventType?: string
): Promise<SwarmTimelineEvent[]> {
  let url = `/v0/swarm/${missionId}/timeline-events?limit=${limit}`;
  if (agentName) {
    url += `&agent=${encodeURIComponent(agentName)}`;
  }
  if (eventType) {
    url += `&event_type=${encodeURIComponent(eventType)}`;
  }
  return fetchJson<SwarmTimelineEvent[]>(url);
}

// ============================================================
// Finding Functions
// ============================================================

// Note: Backend returns array directly
export async function getSwarmFindings(missionId: string): Promise<SwarmFindingResponse> {
  return fetchJson<SwarmFindingResponse>(`/v0/swarm/${missionId}/findings`);
}

// ============================================================
// Exploit Functions
// ============================================================

export async function getSwarmExploits(missionId: string, limit: number = 50): Promise<SwarmExploitsResponse> {
  return fetchJson<SwarmExploitsResponse>(`/v0/swarm/${missionId}/exploit-attempts?limit=${limit}`);
}

// ============================================================
// WebSocket Functions
// ============================================================

export interface WebSocketMessage {
  type: string;
  data: Record<string, unknown>;
}

export type MessageHandler = (message: WebSocketMessage) => void;

export function createSwarmWebSocket(
  missionId: string,
  onMessage: MessageHandler,
  onConnect?: () => void,
  onDisconnect?: () => void
): { close: () => void; send: (data: unknown) => void } {
  const wsUrl = `${API_BASE.replace('http', 'ws')}/ws/${missionId}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[WS] Connected to mission:', missionId);
    onConnect?.();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (e) {
      console.error('[WS] Failed to parse message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected from mission:', missionId);
    onDisconnect?.();
  };

  ws.onerror = (error) => {
    console.error('[WS] Error:', error);
  };

  return {
    close: () => ws.close(),
    send: (data: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    },
  };
}

// ============================================================
// Legacy API compatibility
// ============================================================

// For backward compatibility with existing code
export async function listSwarmMissions(): Promise<SwarmMissionList> {
  return getSwarmMissions();
}

// ============================================================
// BLUE TEAM SCAN API - Missing functions
// ============================================================

// Trigger a new scan
export interface TriggerScanRequest {
  repo_url: string;
  triggered_by?: string;
  priority?: string;
}

export interface TriggerScanResponse {
  scan_id: string;
  status: string;
  repo_url: string;
}

export async function triggerScan(request: TriggerScanRequest): Promise<TriggerScanResponse> {
  return fetchJson<TriggerScanResponse>('/v0/scans/trigger', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// Get scan status
export interface ScanStatusResponse {
  scan_id: string;
  status: string;
  progress: number;
  current_stage?: string;
  error_message?: string;
  /** Source of data: 'supabase' for real data, 'mock' for sample data */
  dataSource?: 'supabase' | 'mock';
}

export async function getScanStatus(scanId: string): Promise<ScanStatusResponse> {
  return fetchJson<ScanStatusResponse>(`/v0/scans/${scanId}/status`);
}

// Get scan results
export interface VulnerabilityFinding {
  id: string;
  scan_id: string;
  file_path: string;
  line_start: number;
  vuln_type: string;
  title: string;
  description: string;
  severity: string;
  confidence: string;
  confirmed: boolean;
}

export interface ScanReportResponse {
  scan_id: string;
  repo_url: string;
  status: string;
  summary: {
    total: number;
    confirmed: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  findings: VulnerabilityFinding[];
}

export async function getScanResults(scanId: string): Promise<ScanReportResponse> {
  return fetchJson<ScanReportResponse>(`/v0/scans/${scanId}/results`);
}

// List scans
export interface ScanListResponse {
  scans: Array<{
    scan_id: string;
    repo_url: string;
    status: string;
    created_at: string;
    /** Source of data: 'supabase' for real data, 'mock' for sample data */
    dataSource?: 'supabase' | 'mock';
  }>;
  total: number;
}

export async function listScans(limit: number = 10, offset: number = 0): Promise<ScanListResponse> {
  return fetchJson<ScanListResponse>(`/v0/scans/?limit=${limit}&offset=${offset}`);
}

// ============================================================
// CHAT API
// ============================================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SendChatRequest {
  messages: ChatMessage[];
}

export interface SendChatResponse {
  message: {
    role: 'user' | 'assistant';
    content: string;
  };
  conversation_id: string;
}

export async function sendChatMessage(request: SendChatRequest): Promise<SendChatResponse> {
  return fetchJson<SendChatResponse>('/v0/chat/', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function sendChatMessageSimple(message: string, agent: string, team: 'red' | 'blue'): Promise<SendChatResponse> {
  return fetchJson<SendChatResponse>('/v0/chat/', {
    method: 'POST',
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      team
    }),
  });
}
