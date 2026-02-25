const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

async function fetchApi<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
            errorText || `HTTP error! status: ${response.status}`,
            response.status
        );
    }

    return response.json();
}

// API endpoints for Red Team agent system
const api = {
    // Health check
    checkHealth: () => fetchApi<{ status: string }>("/health"),

    // Mission management
    startMission: (data: {
        target: string;
        objective?: string;
        mission_id?: string;
    }) =>
        fetchApi<{ mission_id: string; message: string }>("/api/mission/start", {
            method: "POST",
            body: JSON.stringify(data),
        }),

    getMissionStatus: (missionId: string) =>
        fetchApi<{
            mission_id: string;
            phase: string;
            status: string;
            progress: number;
            current_agent: string | null;
            error_message: string | null;
        }>(`/api/mission/${missionId}/status`),

    getMissionReport: (missionId: string) =>
        fetchApi<{
            mission_id: string;
            target: string;
            objective: string;
            phase: string;
            report: Record<string, unknown>;
            recon_results: Array<Record<string, unknown>>;
            exploit_results: Array<Record<string, unknown>>;
            errors: string[];
        }>(`/api/mission/${missionId}/report`),

    // Agent messages
    getMissionMessages: (missionId: string) =>
        fetchApi<{
            messages: Array<{
                id: string;
                sender: string;
                receiver: string;
                content: string;
                message_type: string;
                timestamp: string;
            }>;
        }>(`/api/mission/${missionId}/messages`),

    // Blackboard (shared intelligence)
    getBlackboard: (missionId: string) =>
        fetchApi<{
            blackboard: Record<string, unknown>;
        }>(`/api/mission/${missionId}/blackboard`),

    // Human-in-the-loop
    approveAction: (missionId: string, actionId: string) =>
        fetchApi<{ approved: boolean }>(
            `/api/mission/${missionId}/approve/${actionId}`,
            {
                method: "POST",
            }
        ),

    rejectAction: (missionId: string, actionId: string, reason?: string) =>
        fetchApi<{ rejected: boolean }>(
            `/api/mission/${missionId}/reject/${actionId}`,
            {
                method: "POST",
                body: JSON.stringify({ reason }),
            }
        ),

    // Cancel mission
    cancelMission: (missionId: string) =>
        fetchApi<{ cancelled: boolean }>(`/api/mission/${missionId}/cancel`, {
            method: "POST",
        }),
};

export default api;
