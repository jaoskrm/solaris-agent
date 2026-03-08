import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { FileCode2, Shield, Activity, Code2, Play, CircleDot, ChevronRight, BarChart3, AlertTriangle, Lock, FileWarning, Loader2, Check } from 'lucide-react';
import { Card } from './components/ui/Card';
import { Badge } from './components/ui/Badge';
import { listScans, getScanResults } from './lib/api';
import type { ScanStatusResponse, ScanReportResponse, VulnerabilityFinding } from './types';

// Mock Data for Quality Issues (until we have real quality data)
const topQualityIssues = [
    { id: 'qual-1', severity: 'critical', title: 'express 4.17.1 has known CVEs — upgrade to 4.21+', path: 'package.json:15', label: 'TRIVIAL' },
    { id: 'qual-2', severity: 'high', title: 'moment.js detected — replace with date-fns', path: 'src/utils/dates.ts:1', label: 'MEDIUM' },
    { id: 'qual-3', severity: 'high', title: 'processPayment() is 187 lines — split into smaller functions', path: 'src/services/payments.ts:22', label: 'LARGE' },
    { id: 'qual-4', severity: 'medium', title: 'console.log statements left in production code', path: 'src/routes/auth.ts:28', label: 'SMALL' },
];

interface DashboardStats {
    totalScans: number;
    completedScans: number;
    runningScans: number;
    totalVulnerabilities: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    vulnerabilityTypes: { type: string; count: number; severity: string }[];
    recentScans: ScanStatusResponse[];
    topFindings: VulnerabilityFinding[];
    /** Data source indicator: 'supabase' for real data, 'mock' for sample data */
    dataSource?: 'supabase' | 'mock';
}

// Helper function to extract vulnerability type from finding
function getVulnerabilityType(finding: VulnerabilityFinding): string {
    // First check vuln_type
    if (finding.vuln_type && finding.vuln_type !== 'null' && finding.vuln_type !== 'undefined' && finding.vuln_type.trim() !== '') {
        return finding.vuln_type.replace(/_/g, ' ').trim();
    }
    
    // Try to extract from title
    const title = finding.title || '';
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('sql injection') || titleLower.includes('sqli')) return 'SQL Injection';
    if (titleLower.includes('xss') || titleLower.includes('cross-site scripting')) return 'XSS';
    if (titleLower.includes('path traversal') || titleLower.includes('directory traversal')) return 'Path Traversal';
    if (titleLower.includes('hardcoded') || titleLower.includes('secret') || titleLower.includes('password') || titleLower.includes('api key')) return 'Hardcoded Secret';
    if (titleLower.includes('idor')) return 'IDOR';
    if (titleLower.includes('xxe') || titleLower.includes('xml external entity')) return 'XXE';
    if (titleLower.includes('command injection') || titleLower.includes('code injection')) return 'Command Injection';
    if (titleLower.includes('deserialization')) return 'Insecure Deserialization';
    if (titleLower.includes('csrf') || titleLower.includes('cross-site request forgery')) return 'CSRF';
    if (titleLower.includes('lfi') || titleLower.includes('local file inclusion')) return 'LFI';
    if (titleLower.includes('rfi') || titleLower.includes('remote file inclusion')) return 'RFI';
    if (titleLower.includes('open redirect')) return 'Open Redirect';
    if (titleLower.includes('ssrf')) return 'SSRF';
    if (titleLower.includes('rce') || titleLower.includes('remote code execution')) return 'RCE';
    if (titleLower.includes('authentication') || titleLower.includes('auth bypass')) return 'Auth Bypass';
    
    // If title exists, use first few words
    if (title && title.trim() !== '') {
        const words = title.trim().split(/\s+/).slice(0, 3).join(' ');
        if (words) return words;
    }
    
    // Try description as last resort
    const desc = finding.description || '';
    if (desc && desc.trim() !== '') {
        const descWords = desc.trim().split(/\s+/).slice(0, 3).join(' ');
        if (descWords) return descWords;
    }
    
    return 'Other';
}

export function Dashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 15 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 400, damping: 30 } }
    };

    useEffect(() => {
        async function fetchDashboardData() {
            try {
                setLoading(true);
                setError(null);

                // Fetch scans from API
                const scansResponse = await listScans(20, 0);
                const scans = scansResponse.scans || [];
                
                // Log the data source and count
                console.log('[Dashboard] Data Source:', scans[0]?.dataSource || 'unknown');
                console.log('[Dashboard] Total scans from API:', scansResponse.total);
                console.log('[Dashboard] Scans received:', scans.length);
                scans.forEach((scan, i) => {
                    console.log(`[Dashboard] Scan ${i+1}:`, {
                        id: scan.scan_id,
                        status: scan.status,
                        createdAt: scan.created_at,
                        dataSource: scan.dataSource
                    });
                });

                // Calculate basic stats
                const completedScans = scans.filter(s => s.status === 'completed');
                const runningScans = scans.filter(s => s.status === 'running');

                // Fetch detailed results for completed scans to get vulnerability data
                const scanResults: ScanReportResponse[] = [];
                for (const scan of completedScans.slice(0, 5)) {
                    try {
                        const result = await getScanResults(scan.scan_id);
                        console.log('[Dashboard] Scan results for', scan.scan_id, ':', {
                            total: result.summary?.total || 0,
                            confirmed: result.summary?.confirmed || 0,
                            critical: result.summary?.critical || 0,
                            high: result.summary?.high || 0,
                            medium: result.summary?.medium || 0,
                            low: result.summary?.low || 0,
                            findingsCount: result.findings?.length || 0
                        });
                        scanResults.push(result);
                    } catch (err) {
                        console.error(`Failed to fetch results for scan ${scan.scan_id}:`, err);
                    }
                }

                // Aggregate vulnerability data
                let totalVulns = 0;
                let criticalCount = 0;
                let highCount = 0;
                let mediumCount = 0;
                let lowCount = 0;
                const typeMap: Map<string, { count: number; severity: string }> = new Map();
                const allFindings: VulnerabilityFinding[] = [];

                scanResults.forEach(result => {
                    if (result.summary) {
                        totalVulns += result.summary.confirmed || 0;
                        criticalCount += result.summary.critical || 0;
                        highCount += result.summary.high || 0;
                        mediumCount += result.summary.medium || 0;
                        lowCount += result.summary.low || 0;
                    }

                    if (result.findings && Array.isArray(result.findings)) {
                        result.findings
                            .filter(f => f && f.confirmed)
                            .forEach(f => {
                                allFindings.push(f);
                                const type = getVulnerabilityType(f);
                                const existing = typeMap.get(type);
                                if (existing) {
                                    existing.count++;
                                } else {
                                    typeMap.set(type, { count: 1, severity: f.severity });
                                }
                            });
                    }
                });

                // Convert type map to array and sort by count
                const vulnerabilityTypes = Array.from(typeMap.entries())
                    .map(([type, data]) => ({ type, count: data.count, severity: data.severity }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 8);

                // Get top findings
                const topFindings = allFindings
                    .sort((a, b) => {
                        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
                        return severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder];
                    })
                    .slice(0, 4);

                setStats({
                    totalScans: scans.length,
                    completedScans: completedScans.length,
                    runningScans: runningScans.length,
                    totalVulnerabilities: totalVulns,
                    criticalCount,
                    highCount,
                    mediumCount,
                    lowCount,
                    vulnerabilityTypes,
                    recentScans: scans.slice(0, 4),
                    topFindings,
                    // Use the dataSource from the first scan, or default to supabase
                    dataSource: scans[0]?.dataSource || 'supabase'
                });
            } catch (err) {
                console.error('Failed to fetch dashboard data:', err);
                setError('Failed to load dashboard data. Please try again later.');
            } finally {
                setLoading(false);
            }
        }

        fetchDashboardData();
    }, []);

    // Calculate severity counts for charts
    const severityCounts = {
        critical: stats?.criticalCount || 0,
        high: stats?.highCount || 0,
        medium: stats?.mediumCount || 0,
        low: stats?.lowCount || 0,
    };

    const totalVulns = stats?.totalVulnerabilities || 1; // Avoid division by zero

    // Get icon for vulnerability type
    const getVulnIcon = (type: string) => {
        const typeLower = type.toLowerCase();
        if (typeLower.includes('sql') || typeLower.includes('secret')) return Lock;
        if (typeLower.includes('xss') || typeLower.includes('traversal') || typeLower.includes('command')) return AlertTriangle;
        if (typeLower.includes('idor')) return Shield;
        return FileWarning;
    };

    // Get color for severity
    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'bg-red-500';
            case 'high': return 'bg-orange-500';
            case 'medium': return 'bg-yellow-500';
            default: return 'bg-blue-500';
        }
    };

    if (loading) {
        return (
            <div className="w-full relative z-10 px-6 py-8 flex flex-col items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-4" />
                <p className="text-gray-400">Loading dashboard data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full relative z-10 px-6 py-8 flex flex-col items-center justify-center min-h-screen">
                <div className="text-red-400 mb-2">⚠️ {error}</div>
                <button 
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="w-full relative z-10 px-6 py-8 flex flex-col gap-6 max-w-[1400px] mx-auto min-h-screen">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Dashboard</h1>
                    <p className="text-sm text-gray-400">Security & code quality overview</p>
                </div>
                {/* Data Source Indicator */}
                {stats?.dataSource && (
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                        stats.dataSource === 'supabase' 
                            ? 'bg-green-900/30 text-green-400 border border-green-800' 
                            : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'
                    }`}>
                        {stats.dataSource === 'supabase' ? '● Live Data' : '◉ Sample Data'}
                    </div>
                )}
            </div>

            <motion.div
                className="flex flex-col gap-6"
                variants={container}
                initial="hidden"
                animate="show"
            >
                {/* Top Metrics Row */}
                <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="p-5 flex flex-col justify-between h-32 border-gray-800">
                        <div className="flex justify-between items-start text-gray-400">
                            <span className="text-xs font-semibold tracking-wider uppercase">Total Scans</span>
                            <FileCode2 className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-4xl font-semibold text-white mb-1">{stats?.totalScans || 0}</div>
                            <div className="text-xs text-gray-500">{stats?.completedScans || 0} completed</div>
                        </div>
                    </Card>

                    <Card className="p-5 flex flex-col justify-between h-32 border-red-900/40 bg-red-950/10">
                        <div className="flex justify-between items-start text-gray-400">
                            <span className="text-xs font-semibold tracking-wider uppercase">Security Issues</span>
                            <Shield className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-4xl font-semibold text-white mb-1">{stats?.totalVulnerabilities || 0}</div>
                            <div className="text-xs text-gray-500">{stats?.criticalCount || 0} critical</div>
                        </div>
                    </Card>

                    <Card className="p-5 flex flex-col justify-between h-32 border-blue-900/30 bg-blue-950/10">
                        <div className="flex justify-between items-start text-gray-400">
                            <span className="text-xs font-semibold tracking-wider uppercase">Quality Issues</span>
                            <Code2 className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-4xl font-semibold text-white mb-1">132</div>
                            <div className="text-xs text-gray-500">Across all scans</div>
                        </div>
                    </Card>

                    <Card className="p-5 flex flex-col justify-between h-32 border-emerald-900/30 bg-emerald-950/10">
                        <div className="flex justify-between items-start text-gray-400">
                            <span className="text-xs font-semibold tracking-wider uppercase">Active Scans</span>
                            <Activity className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-4xl font-semibold text-white mb-1">{stats?.runningScans || 0}</div>
                            <div className={`text-xs ${(stats?.runningScans || 0) > 0 ? 'text-emerald-500/80' : 'text-gray-500'}`}>
                                {(stats?.runningScans || 0) > 0 ? 'In progress' : 'No active scans'}
                            </div>
                        </div>
                    </Card>
                </motion.div>

                {/* Vulnerability Statistics */}
                {(stats?.totalVulnerabilities || 0) > 0 && (
                    <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Severity Distribution Chart */}
                        <Card className="border-gray-800 bg-[#0c0c0c]/80 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <BarChart3 className="w-4 h-4 text-emerald-500" />
                                <h2 className="text-sm font-semibold text-gray-200">Severity Distribution</h2>
                            </div>
                            <div className="space-y-3">
                                {/* Critical */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-400 w-16">Critical</span>
                                    <div className="flex-1 h-6 bg-gray-800/50 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(severityCounts.critical / totalVulns) * 100}%` }}
                                            transition={{ duration: 1, delay: 0.1 }}
                                            className="h-full bg-red-500 flex items-center justify-end px-2"
                                        >
                                            {severityCounts.critical > 0 && (
                                                <span className="text-xs font-medium text-white">{severityCounts.critical}</span>
                                            )}
                                        </motion.div>
                                    </div>
                                </div>
                                {/* High */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-400 w-16">High</span>
                                    <div className="flex-1 h-6 bg-gray-800/50 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(severityCounts.high / totalVulns) * 100}%` }}
                                            transition={{ duration: 1, delay: 0.2 }}
                                            className="h-full bg-orange-500 flex items-center justify-end px-2"
                                        >
                                            {severityCounts.high > 0 && (
                                                <span className="text-xs font-medium text-white">{severityCounts.high}</span>
                                            )}
                                        </motion.div>
                                    </div>
                                </div>
                                {/* Medium */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-400 w-16">Medium</span>
                                    <div className="flex-1 h-6 bg-gray-800/50 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(severityCounts.medium / totalVulns) * 100}%` }}
                                            transition={{ duration: 1, delay: 0.3 }}
                                            className="h-full bg-yellow-500 flex items-center justify-end px-2"
                                        >
                                            {severityCounts.medium > 0 && (
                                                <span className="text-xs font-medium text-white">{severityCounts.medium}</span>
                                            )}
                                        </motion.div>
                                    </div>
                                </div>
                                {/* Low */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-400 w-16">Low</span>
                                    <div className="flex-1 h-6 bg-gray-800/50 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(severityCounts.low / totalVulns) * 100}%` }}
                                            transition={{ duration: 1, delay: 0.4 }}
                                            className="h-full bg-blue-500 flex items-center justify-end px-2"
                                        >
                                            {severityCounts.low > 0 && (
                                                <span className="text-xs font-medium text-white">{severityCounts.low}</span>
                                            )}
                                        </motion.div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-800/60 flex justify-between text-xs text-gray-500">
                                <span>Total Vulnerabilities</span>
                                <span className="font-medium text-gray-300">{stats?.totalVulnerabilities || 0}</span>
                            </div>
                        </Card>

                        {/* Vulnerability Types */}
                        <Card className="border-gray-800 bg-[#0c0c0c]/80 p-5 lg:col-span-2">
                            <div className="flex items-center gap-2 mb-4">
                                <Shield className="w-4 h-4 text-emerald-500" />
                                <h2 className="text-sm font-semibold text-gray-200">Vulnerabilities by Type</h2>
                            </div>
                            {stats?.vulnerabilityTypes && stats.vulnerabilityTypes.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {stats.vulnerabilityTypes.map((vuln, idx) => {
                                        const Icon = getVulnIcon(vuln.type);
                                        return (
                                            <motion.div
                                                key={vuln.type}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.05 }}
                                                className="p-3 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className={`w-2 h-2 rounded-full ${getSeverityColor(vuln.severity)}`} />
                                                    <Icon className="w-3.5 h-3.5 text-gray-400" />
                                                </div>
                                                <div className="text-2xl font-semibold text-white mb-1">{vuln.count}</div>
                                                <div className="text-[10px] text-gray-500 leading-tight">{vuln.type}</div>
                                                <div className={`text-[10px] mt-1 capitalize ${
                                                    vuln.severity === 'critical' ? 'text-red-400' :
                                                    vuln.severity === 'high' ? 'text-orange-400' :
                                                    vuln.severity === 'medium' ? 'text-yellow-400' :
                                                    'text-blue-400'
                                                }`}>
                                                    {vuln.severity}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No vulnerability data available yet</p>
                                </div>
                            )}
                        </Card>
                    </motion.div>
                )}

                {/* Recent Scans List */}
                <motion.div variants={item}>
                    <Card className="border-gray-800 bg-[#0c0c0c]/80 backdrop-blur-2xl">
                        <div className="flex items-center justify-between p-4 border-b border-gray-800/60">
                            <h2 className="text-sm font-semibold text-gray-200">Recent Scans</h2>
                            <button className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center transition-colors">
                                View all <ChevronRight className="w-3 h-3 ml-1" />
                            </button>
                        </div>
                        <div className="flex flex-col">
                            {stats?.recentScans && stats.recentScans.length > 0 ? (
                                stats.recentScans.map((scan, i) => (
                                    <div key={scan.scan_id} className={`flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors ${i !== (stats.recentScans?.length || 0) - 1 ? 'border-b border-gray-800/40' : ''}`}>
                                        <div className="flex items-start gap-3">
                                            <div className="mt-1">
                                                {scan.status === 'running' ? (
                                                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                                ) : scan.status === 'completed' ? (
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                ) : scan.status === 'failed' ? (
                                                    <div className="w-2 h-2 rounded-full bg-red-500" />
                                                ) : (
                                                    <div className="w-2 h-2 rounded-full bg-gray-500" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-mono text-sm text-gray-300 font-medium tracking-tight mb-1">{scan.scan_id.slice(0, 8)}...</div>
                                                <div className="text-[11px] text-gray-500">
                                                    {scan.created_at ? new Date(scan.created_at).toLocaleString() : 'Unknown date'}
                                                    {scan.progress > 0 && ` • ${scan.progress}%`}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            {/* Status Badge */}
                                            <div className={`px-2 py-1 border rounded text-[10px] font-medium uppercase tracking-wider ${
                                                scan.status === 'completed'
                                                    ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20'
                                                    : scan.status === 'failed'
                                                    ? 'bg-red-500/5 text-red-500 border-red-500/20'
                                                    : scan.status === 'running'
                                                    ? 'bg-blue-500/5 text-blue-500 border-blue-500/20'
                                                    : 'bg-gray-500/5 text-gray-500 border-gray-500/20'
                                            }`}>
                                                {scan.status}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No scans yet. Start your first scan!</p>
                                </div>
                            )}
                        </div>
                    </Card>
                </motion.div>

                {/* Bottom Splits (Findings vs Quality) */}
                <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Security Findings List */}
                    <Card className="border-gray-800 bg-[#0c0c0c]/80 flex flex-col">
                        <div className="p-4 border-b border-gray-800/60 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-emerald-500" />
                            <h2 className="text-sm font-semibold text-gray-200">Top Security Findings</h2>
                        </div>
                        <div className="flex flex-col p-4 gap-3">
                            {stats?.topFindings && stats.topFindings.length > 0 ? (
                                stats.topFindings.map(finding => (
                                    <div key={finding.id} className="flex justify-between items-start gap-4 p-3 bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.02] rounded-lg transition-colors group cursor-pointer">
                                        <div className="flex gap-3 items-start min-w-0">
                                            <Badge severity={finding.severity as any} className="mt-0.5" />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-medium text-gray-200 truncate">{finding.title || finding.vuln_type?.replace(/_/g, ' ')}</span>
                                                <span className="text-xs font-mono text-gray-500 mt-1 truncate">{finding.file_path}:{finding.line_start}</span>
                                            </div>
                                        </div>
                                        {finding.confirmed && (
                                            <div className="px-1.5 py-0.5 border border-red-900/50 bg-red-950/20 text-red-500 text-[9px] font-bold rounded uppercase tracking-widest shrink-0">
                                                CONFIRMED
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <Check className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-50" />
                                    <p className="text-sm">No confirmed vulnerabilities found</p>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Quality Issues List */}
                    <Card className="border-gray-800 bg-[#0c0c0c]/80 flex flex-col">
                        <div className="p-4 border-b border-gray-800/60 flex items-center gap-2">
                            <Code2 className="w-4 h-4 text-blue-500" />
                            <h2 className="text-sm font-semibold text-gray-200">Top Quality Issues</h2>
                        </div>
                        <div className="flex flex-col p-4 gap-3">
                            {topQualityIssues.map(issue => (
                                <div key={issue.id} className="flex justify-between items-start gap-4 p-3 bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.02] rounded-lg transition-colors group cursor-pointer">
                                    <div className="flex gap-3 items-start min-w-0">
                                        <Badge severity={issue.severity as any} className="mt-0.5" />
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-medium text-gray-200 truncate">{issue.title}</span>
                                            <span className="text-xs font-mono text-gray-500 mt-1 truncate">{issue.path}</span>
                                        </div>
                                    </div>
                                    {issue.label && (
                                        <div className="px-1.5 py-0.5 border border-gray-700 bg-gray-800/50 text-gray-400 text-[9px] font-bold rounded uppercase tracking-widest shrink-0">
                                            {issue.label}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>
                </motion.div>
            </motion.div>
        </div>
    );
}
