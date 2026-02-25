import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatTimestamp(date: Date): string {
    return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function getSeverityColor(severity: string): string {
    switch (severity.toLowerCase()) {
        case "critical":
            return "border-l-vuln-critical text-vuln-critical";
        case "high":
            return "border-l-vuln-high text-vuln-high";
        case "medium":
            return "border-l-vuln-medium text-vuln-medium";
        case "low":
            return "border-l-vuln-low text-vuln-low";
        default:
            return "border-l-vuln-info text-vuln-info";
    }
}

export function getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
        case "completed":
            return "bg-green-500/20 text-green-400";
        case "running":
            return "bg-blue-500/20 text-blue-400";
        case "pending":
            return "bg-yellow-500/20 text-yellow-400";
        case "failed":
            return "bg-red-500/20 text-red-400";
        case "cancelled":
            return "bg-gray-500/20 text-gray-400";
        default:
            return "bg-gray-500/20 text-gray-400";
    }
}

export function getPhaseColor(phase: string): string {
    switch (phase.toLowerCase()) {
        case "planning":
            return "bg-purple-500/20 text-purple-400 border-purple-500/50";
        case "recon":
            return "bg-blue-500/20 text-blue-400 border-blue-500/50";
        case "exploitation":
            return "bg-orange-500/20 text-orange-400 border-orange-500/50";
        case "reporting":
            return "bg-green-500/20 text-green-400 border-green-500/50";
        case "complete":
            return "bg-accent-primary/20 text-accent-primary border-accent-primary/50";
        default:
            return "bg-gray-500/20 text-gray-400 border-gray-500/50";
    }
}

export function extractTargetName(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return url;
    }
}

export function isValidUrl(string: string): boolean {
    try {
        new URL(string);
        return true;
    } catch {
        return false;
    }
}
