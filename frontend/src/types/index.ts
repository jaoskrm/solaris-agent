// API Types
export interface ScanStatusResponse {
    scan_id: string;
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    progress: number;
    current_stage?: string;
    stage_output?: Record<string, unknown> | null;
    error_message?: string;
    created_at?: string;
    updated_at?: string;
}

export interface TriggerScanResponse {
    scan_id: string;
    status: string;
    repo_url: string;
}

export interface ChatMessage {
    id: string;
    scan_id: string;
    team: "red" | "blue";
    agent_name: string;
    content: string;
    timestamp: string;
}

export interface SendChatRequest {
    team: "red" | "blue";
    message: string;
}

export interface SendChatResponse {
    response: string;
    agent: string;
}

// Vulnerability Finding Types
export interface VulnerabilityFinding {
    id: string;
    scan_id: string;
    file_path: string;
    line_start: number;
    line_end?: number;
    vuln_type: string;
    title: string;
    description: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    confidence: "high" | "medium" | "low";
    confirmed: boolean;
    verification_reason?: string;
    fix_suggestion?: string;
    code_snippet?: string;
    details?: Record<string, unknown>;
    created_at?: string;
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
    report_path?: string;
    created_at?: string;
    completed_at?: string;
}
