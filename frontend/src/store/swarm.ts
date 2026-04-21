import { create } from 'zustand';

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'Running' | 'Idle' | 'Offline';
  task: string;
  prog: number;
  color: string;
}

export interface Finding {
  id: string;
  title: string;
  subtitle: string;
  sev: 'Critical' | 'High' | 'Medium' | 'Low';
  loc: string;
  cvss: string;
  agent: string;
  status: 'Open' | 'Triaged' | 'Fixed';
  desc?: string;
  timestamp?: string;
}

export interface Exploit {
  id: string;
  tech: string;
  result: 'Success' | 'Failed' | 'Running';
  target: string;
  cvss: string;
  agent: string;
}

export interface Secret {
  key: string;
  value: string;
  type: 'AWS' | 'JWT' | 'DB' | 'API';
  revealed: boolean;
}

export interface Log {
  id: string;
  agent: string;
  msg: string;
  time: string;
  type: 'system' | 'commander' | 'user';
}

export interface Notification {
  id: string;
  type: 'alert' | 'success' | 'info';
  title: string;
  msg: string;
  read: boolean;
}

interface SwarmState {
  activeView: string;
  setActiveView: (view: string) => void;
  
  findings: Finding[];
  setFindings: (findings: Finding[]) => void;
  markFinding: (id: string, status: string) => void;
  runExploit: (findingId: string) => void;
  setSelectedFindingId: (id: string | null) => void;
  selectedFindingId: string | null;
  
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;
  triggerScan: (agentId: string) => void;
  
  exploits: Exploit[];
  setExploits: (exploits: Exploit[]) => void;
  
  secrets: Secret[];
  setSecrets: (secrets: Secret[]) => void;
  revealSecret: (key: string) => void;
  
  logs: Log[];
  addLog: (log: Log) => void;
  
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
  
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  
  theme: 'light' | 'charcoal' | 'black';
  cycleTheme: () => void;
  
  globalRiskScore: number;
  metrics: {
    mttd: string;
    successRate: string;
    totalEndpoints: number;
    openPorts: number;
    subdomains: number;
  };
  
  simulateTick: () => void;
}

const INITIAL_FINDINGS: Finding[] = [
  { id: '01', title: 'RCE — Apache Tomcat', subtitle: 'CVE-2024-1234', sev: 'Critical', loc: ':8443/manager', cvss: '9.8', agent: 'Exploit', status: 'Open', desc: 'Remote code execution vulnerability in Apache Tomcat manager interface. Allows unauthorized deployment of malicious WAR archives.', timestamp: '2026-04-17 14:00:00' },
  { id: '02', title: 'Domain Admin Kerberoasting', subtitle: 'TGS Ticket Exfil', sev: 'Critical', loc: 'DC-01.acme.corp', cvss: '9.1', agent: 'Recon', status: 'Open', desc: 'Kerberoasting attack successfully extracted TGS tickets for service accounts with SPNs. Offline password cracking in progress.', timestamp: '2026-04-17 14:02:00' },
  { id: '03', title: 'SSRF → AWS IMDSv1', subtitle: 'Metadata Credential Theft', sev: 'Critical', loc: 'api.acme.corp', cvss: '8.8', agent: 'Exploit', status: 'Triaged', desc: 'Server-side request forgery leading to AWS IMDSv1 metadata endpoint access. Successfully extracted temporary AWS credentials.', timestamp: '2026-04-17 14:05:00' },
  { id: '04', title: 'SQL Injection — UNION', subtitle: 'User Table Extraction', sev: 'High', loc: '/api/v2/users', cvss: '7.5', agent: 'Exploit', status: 'Open', desc: 'Blind SQL injection in user search endpoint. Data exfiltration confirmed via UNION-based extraction.', timestamp: '2026-04-17 14:10:00' },
  { id: '05', title: 'Exposed Redis Instance', subtitle: 'Unauthenticated Access', sev: 'High', loc: '192.168.0.45:6379', cvss: '7.2', agent: 'Recon', status: 'Open', desc: 'Redis instance exposed without authentication. Confirmed read/write access to all keys.', timestamp: '2026-04-17 14:12:00' },
  { id: '06', title: 'Jenkins Null Session', subtitle: 'Global Config Read', sev: 'Medium', loc: 'ci.acme.corp', cvss: '5.4', agent: 'OSINT (Researcher)', status: 'Fixed', desc: 'Jenkins instance accessible without authentication. Global system configuration and credentials exposed.', timestamp: '2026-04-17 14:15:00' },
  { id: '07', title: 'Stale SSH Key Discovered', subtitle: 'Authorized Keys Leak', sev: 'Low', loc: 'jump.acme.corp', cvss: '3.2', agent: 'OSINT (Researcher)', status: 'Open', desc: 'Stale authorized_keys entry found on jump host. Potential persistence mechanism.', timestamp: '2026-04-17 14:18:00' },
];

const INITIAL_AGENTS: Agent[] = [
  { id: 'orchestrator', name: 'Orchestrator', role: 'Orchestrator', status: 'Running', task: 'Coordinating exploit chain deployment across multiple vectors', prog: 72, color: 'text-amber-500' },
  { id: 'exploit', name: 'Exploit', role: 'Exploit', status: 'Running', task: 'Weaponizing payloads for Apache Tomcat RCE (CVE-2024-1234)', prog: 55, color: 'text-red-500' },
  { id: 'recon', name: 'Recon', role: 'Recon', status: 'Running', task: 'Network enumeration and surface mapping on 192.168.0.0/24', prog: 88, color: 'text-amber-500' },
  { id: 'osint', name: 'OSINT (Researcher)', role: 'OSINT', status: 'Running', task: 'CVE database correlation and GitHub reconnaissance', prog: 63, color: 'text-emerald-500' },
];

const INITIAL_EXPLOITS: Exploit[] = [
  { id: '01', tech: 'Tomcat RCE (CVE-2024-1234)', result: 'Success', target: '192.168.0.12:8443', cvss: '9.8', agent: 'Exploit' },
  { id: '02', tech: 'Redis RCE via Lua', result: 'Success', target: '192.168.0.45:6379', cvss: '7.2', agent: 'Exploit' },
  { id: '03', tech: 'Jenkins Script Console', result: 'Running', target: '192.168.0.5:8080', cvss: '8.1', agent: 'Exploit' },
  { id: '04', tech: 'Log4Shell (Legacy)', result: 'Failed', target: '192.168.0.21', cvss: '10.0', agent: 'Recon' },
  { id: '05', tech: 'Spring4Shell', result: 'Failed', target: '192.168.0.22', cvss: '9.8', agent: 'Recon' },
];

const INITIAL_SECRETS: Secret[] = [
  { key: 'AWS_ACCESS_KEY_ID', value: 'AKIAIOSFODNN7EXAMPLE', type: 'AWS', revealed: false },
  { key: 'AWS_SECRET_ACCESS_KEY', value: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', type: 'AWS', revealed: false },
  { key: 'JWT_SECRET', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', type: 'JWT', revealed: false },
  { key: 'DB_PASSWORD', value: 'postgres:ProdApp2026!@#', type: 'DB', revealed: false },
  { key: 'STRIPE_API_KEY', value: 'sk_test_51Hx9qKLkjIowerjtnm', type: 'API', revealed: false },
  { key: 'GITHUB_TOKEN', value: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', type: 'API', revealed: false },
];

const INITIAL_LOGS: Log[] = [
  { id: '1', agent: 'SYS', msg: 'SwarmOps secure transport protocol v3.1 initialized', time: '14:30:00', type: 'system' },
  { id: '2', agent: 'Orchestrator', msg: 'Mission initialized. Spawning swarm agents...', time: '14:30:01', type: 'system' },
  { id: '3', agent: 'Recon', msg: 'Network scanner initialized. Range: 192.168.0.0/24', time: '14:30:02', type: 'system' },
  { id: '4', agent: 'OSINT (Researcher)', msg: 'OSINT module active. Monitoring threat feeds...', time: '14:30:03', type: 'system' },
  { id: '5', agent: 'Recon', msg: 'Port scan complete: 22 open ports identified', time: '14:30:45', type: 'system' },
  { id: '6', agent: 'Recon', msg: '★ High-value target: Apache Tomcat 10.1.31 on :8443', time: '14:30:48', type: 'system' },
  { id: '7', agent: 'Exploit', msg: 'Weaponization module loaded. CVE-2024-1234 PoC ready.', time: '14:31:00', type: 'system' },
  { id: '8', agent: 'OSINT (Researcher)', msg: 'CVE-2024-1234 matched to Apache Tomcat 10.1.31 (CVSS 9.8)', time: '14:31:00', type: 'system' },
  { id: '9', agent: 'Exploit', msg: 'Executing buffer overflow on target :8443...', time: '14:31:45', type: 'system' },
  { id: '10', agent: 'USER', msg: 'nmap -sV -p- 192.168.0.0/24', time: '14:31:50', type: 'commander' },
  { id: '11', agent: 'SYS', msg: 'Starting Nmap 7.94... Scanning 256 hosts. Discovered 22 open ports.', time: '14:31:51', type: 'system' },
  { id: '12', agent: 'Exploit', msg: '★ SHELL OBTAINED! UID=0(root) - Target compromised', time: '14:32:10', type: 'system' },
];

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: '1', type: 'alert', title: 'Critical Finding Detected', msg: 'RCE vulnerability discovered on Apache Tomcat (CVE-2024-1234)', read: false },
  { id: '2', type: 'success', title: 'Exploit Successful', msg: 'Shell obtained on target :8443', read: false },
];

export const useSwarmStore = create<SwarmState>((set, get) => ({
  activeView: 'overview',
  setActiveView: (view) => set({ activeView: view }),
  
  findings: INITIAL_FINDINGS,
  setFindings: (findings) => set({ findings }),
  markFinding: (id, status) => set((state) => ({
    findings: state.findings.map(f => f.id === id ? { ...f, status: status as any } : f)
  })),
  runExploit: (findingId) => {
    const finding = get().findings.find(f => f.id === findingId);
    if (!finding) return;
    
    const newExploit: Exploit = {
      id: Math.random().toString(36).substr(2, 9),
      tech: `${finding.title} (${finding.subtitle})`,
      result: 'Running',
      target: finding.loc,
      cvss: finding.cvss,
      agent: finding.agent
    };
    
    set((state) => ({
      exploits: [...state.exploits, newExploit]
    }));
    
    setTimeout(() => {
      set((state) => ({
        exploits: state.exploits.map(e => e.id === newExploit.id ? { ...e, result: 'Success' } : e)
      }));
    }, 2000);
  },
  selectedFindingId: null,
  setSelectedFindingId: (id) => set({ selectedFindingId: id }),
  
  agents: INITIAL_AGENTS,
  setAgents: (agents) => set({ agents }),
  triggerScan: (agentId) => {
    set((state) => ({
      agents: state.agents.map(a => a.id === agentId ? { ...a, task: 'Scanning...' } : a)
    }));
  },
  
  exploits: INITIAL_EXPLOITS,
  setExploits: (exploits) => set({ exploits }),
  
  secrets: INITIAL_SECRETS,
  setSecrets: (secrets) => set({ secrets }),
  revealSecret: (key) => set((state) => ({
    secrets: state.secrets.map(s => s.key === key ? { ...s, revealed: !s.revealed } : s)
  })),
  
  logs: INITIAL_LOGS,
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
  
  notifications: INITIAL_NOTIFICATIONS,
  markNotificationRead: (id) => set((state) => ({
    notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
  })),
  
  isCommandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  
  theme: 'light',
  cycleTheme: () => set((state) => ({ 
    theme: state.theme === 'light' ? 'charcoal' : state.theme === 'charcoal' ? 'black' : 'light'
  })),
  
  globalRiskScore: 78,
  metrics: {
    mttd: '2.4m',
    successRate: '37',
    totalEndpoints: 847,
    openPorts: 142,
    subdomains: 23
  },
  
  simulateTick: () => {
    const agentMessages: Record<string, string[]> = {
      'Orchestrator': [
        'Synthesizing findings from all agents into unified report.',
        'Redirecting Exploit agent to highest confidence vector.',
        'Coordinating multi-stage attack chain deployment.'
      ],
      'Exploit': [
        'Stabilizing shell session for persistent access.',
        'Escalating privileges on compromised host...',
        'Attempting lateral movement via SMB'
      ],
      'Recon': [
        'Analyzing SSL certificates for additional attack surface.',
        'Running directory brute-force against discovered endpoints.',
        'Fingerprinting web application technologies...'
      ],
      'OSINT (Researcher)': [
        'Cross-referencing CVE databases with identified software...',
        'Scanning public code repositories for leaked credentials.',
        'Gathering intelligence on target organization...'
      ]
    };
    
    const randomAgent = Object.keys(agentMessages)[Math.floor(Math.random() * Object.keys(agentMessages).length)];
    const messages = agentMessages[randomAgent];
    const randomMsg = messages[Math.floor(Math.random() * messages.length)];
    
    const newLog: Log = {
      id: Math.random().toString(36).substr(2, 9),
      agent: randomAgent,
      msg: randomMsg,
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      type: 'system'
    };
    
    set((state) => ({ 
      logs: [...state.logs.slice(-50), newLog],
      globalRiskScore: Math.min(100, Math.max(20, state.globalRiskScore + (Math.random() > 0.5 ? 1 : -1)))
    }));
  }
}));