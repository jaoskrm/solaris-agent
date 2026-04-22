import React, { useState, useRef, useEffect } from 'react';
import { useSwarmStore } from '../store/swarm';
import { ArrowLeft, Send, Play, Terminal, Globe, Coffee, Database, Atom, Lock, Circle, FolderOpen, GitBranch, Network, Cpu, Skull, Search, Key, Shield, AlertTriangle, CheckCircle, Clock, Users } from 'lucide-react';

const AGENTS = [
  { 
    id: 'orchestrator', 
    name: 'Orchestrator', 
    role: 'Coordinates all agents · assigns tasks · synthesises findings', 
    color: '#C06010',
    colorBg: '#FFF7EE',
    colorBd: 'rgba(192,96,16,0.24)',
    model: 'claude-3.5-sonnet',
    stats: '142',
    statsLabel: 'Tasks dispatched'
  },
  { 
    id: 'recon', 
    name: 'Recon Agent', 
    role: 'Network scanning · web crawling · subdomain enum · OSINT', 
    color: '#2558D9',
    colorBg: '#EEF3FF',
    colorBd: 'rgba(37,88,217,0.22)',
    model: 'gpt-4o-mini',
    stats: '847',
    statsLabel: 'Endpoints found'
  },
  { 
    id: 'exploit', 
    name: 'Exploit Agent', 
    role: 'Vulnerability verification · exploit execution · post-exploitation', 
    color: '#C13329',
    colorBg: '#FEF2F2',
    colorBd: 'rgba(193,51,41,0.22)',
    model: 'claude-3.5-sonnet',
    stats: '3/8',
    statsLabel: 'Exploits successful'
  },
  { 
    id: 'osint', 
    name: 'Research Agent', 
    role: 'CVE matching · OSINT · dark web monitoring · threat intel', 
    color: '#17864A',
    colorBg: '#F0FDF6',
    colorBd: 'rgba(23,134,74,0.22)',
    model: 'gemini-1.5-pro',
    stats: '31',
    statsLabel: 'CVEs matched'
  },
];

const TIMELINES = {
  orchestrator: [
    { status: 'run', msg: 'Coordinating lateral movement from compromised :8443 host', time: 'now' },
    { status: 'done', msg: 'Redirected EXPLOIT agent from /api/v1 to /manager (higher-confidence path)', time: '08:43' },
    { status: 'done', msg: 'Merged RESEARCH finding (CVE-2024-1234) with RECON port data — tasked EXPLOIT', time: '08:41' },
    { status: 'done', msg: 'Spawned 4 agents — assigned initial mission parameters', time: '08:30' },
  ],
  recon: [
    { status: 'run', msg: 'CT log subdomain enum — 14 new subdomains found (*.internal.acme.corp)', time: 'now' },
    { status: 'done', msg: 'Full port scan complete — 22 ports open across 6 hosts in /24 subnet', time: '08:36' },
    { status: 'done', msg: 'Web crawl complete — 847 endpoints indexed on acme.corp and api.acme.corp', time: '08:35' },
    { status: 'done', msg: 'Technology fingerprinting — Apache Tomcat 10.1.31, Redis 7.2.4, Nginx 1.25', time: '08:33' },
  ],
  exploit: [
    { status: 'run', msg: 'Post-exploit enum on compromised host — uid=0(root) · internal net 10.0.0.0/8', time: 'now' },
    { status: 'done', msg: 'RCE confirmed via CVE-2024-1234 on :8443/manager — reverse shell established', time: '08:46' },
    { status: 'done', msg: 'SQLi confirmed on /api/v2/users — UNION-based, extracted users table (2,847 rows)', time: '08:39' },
    { status: 'fail', msg: 'Redis exploit failed — ACL restricted on this instance (CONFIG protected)', time: '08:38' },
  ],
  osint: [
    { status: 'run', msg: 'CVE research for Redis 7.2.4 — checking NVD, ExploitDB, GitHub PoCs', time: 'now' },
    { status: 'done', msg: 'CVE-2024-1234 confirmed for Tomcat 10.1.31 — PoC available, weaponised', time: '08:41' },
    { status: 'done', msg: '3 leaked credentials found in acme-corp/deploy-scripts GitHub repo (public)', time: '08:34' },
    { status: 'done', msg: 'Dark web scan — no active listings for acme.corp data (last checked 2h ago)', time: '08:31' },
  ],
};

const CURRENT_TASKS = {
  orchestrator: "Analysing RCE finding from EXPLOIT — orchestrating lateral movement chain via compromised Tomcat host",
  recon: "Subdomain enumeration via certificate transparency logs — 14 new subdomains discovered, adding to scan queue",
  exploit: "Post-exploitation on compromised Tomcat host — enumerating internal network, reading /etc/shadow, checking for lateral movement paths",
  osint: "Researching Redis 7.2.4 known CVEs — checking for unauthenticated RCE vectors · analysing leaked creds from GitHub",
};

const AGENT_CONSOLE_LOGS: Record<string, { time: string; msg: string; type: string }[]> = {
  'Orchestrator': [
    { time: '14:30', msg: 'Initializing orchestrator module...', type: 'system' },
    { time: '14:30', msg: 'Mission parameters received: acme.corp (192.168.0.0/24)', type: 'system' },
    { time: '14:31', msg: 'Spawning 4 agents with task assignments', type: 'system' },
    { time: '14:32', msg: 'RECON: Starting port scan on 192.168.0.0/24', type: 'command' },
    { time: '14:35', msg: 'RECON: 22 open ports identified across 6 hosts', type: 'info' },
    { time: '14:36', msg: 'EXPLOIT: CVE-2024-1234 matched for Apache Tomcat — initiating', type: 'command' },
    { time: '14:38', msg: '★ RCE CONFIRMED on :8443 — shell obtained (uid=0)', type: 'success' },
    { time: '14:40', msg: 'Analyzing lateral movement paths from compromised host...', type: 'info' },
    { time: '14:42', msg: 'Enumerate internal network: 10.0.0.0/8 discovered', type: 'info' },
    { time: '14:45', msg: 'Coordinating post-exploitation tasks...', type: 'info' },
  ],
  'Recon': [
    { time: '14:30', msg: 'Initializing network scanner...', type: 'system' },
    { time: '14:30', msg: 'Starting ping sweep on 192.168.0.0/24', type: 'command' },
    { time: '14:32', msg: '6 hosts discovered (ping reply)', type: 'info' },
    { time: '14:33', msg: 'nmap -sV -p- 192.168.0.0/24', type: 'command' },
    { time: '14:35', msg: 'Port scan: 22 (ssh), 80 (http), 443 (ssl/http), 3306 (mysql), 6379 (redis), 8443 (ssl/http)', type: 'info' },
    { time: '14:36', msg: 'Technology fingerprinting completed', type: 'info' },
    { time: '14:38', msg: 'Apache Tomcat 10.1.31 detected on :8443', type: 'info' },
    { time: '14:40', msg: 'Redis 7.2.4 detected on :6379 (no auth)', type: 'alert' },
    { time: '14:42', msg: 'Running ffuf directory brute-force...', type: 'command' },
    { time: '14:45', msg: '847 endpoints discovered', type: 'info' },
  ],
  'Exploit': [
    { time: '14:30', msg: 'Loading exploit modules...', type: 'system' },
    { time: '14:31', msg: 'CVE-2024-1234 PoC loaded', type: 'system' },
    { time: '14:33', msg: 'Validating target: api.acme.corp for SQL injection', type: 'command' },
    { time: '14:35', msg: 'sqlmap -u "https://api.acme.corp/v2/users?id=1" --dbs', type: 'command' },
    { time: '14:36', msg: '★ SQL injection verified — 14 databases', type: 'success' },
    { time: '14:38', msg: 'Extracting users table...', type: 'info' },
    { time: '14:39', msg: '2,847 user records extracted', type: 'info' },
    { time: '14:40', msg: 'python3 cve-2024-1234.py --target :8443', type: 'command' },
    { time: '14:42', msg: '★ SHELL OBTAINED — uid=0(root)', type: 'success' },
    { time: '14:45', msg: 'Reading /etc/shadow on compromised host...', type: 'command' },
  ],
  'Research': [
    { time: '14:30', msg: 'Initializing OSINT module...', type: 'system' },
    { time: '14:31', msg: 'Loading CVE databases...', type: 'system' },
    { time: '14:33', msg: 'cve-search --product tomcat --version 10.1.31', type: 'command' },
    { time: '14:34', msg: '★ CVE-2024-1234 (CVSS 9.8) — Apache Tomcat RCE', type: 'success' },
    { time: '14:36', msg: 'Scanning GitHub for leaked credentials...', type: 'command' },
    { time: '14:38', msg: 'Found 3 potential leaked credentials in acme-corp/deploy-scripts', type: 'alert' },
    { time: '14:40', msg: 'Checking dark web for acme.corp listings...', type: 'command' },
    { time: '14:42', msg: 'No active listings found', type: 'info' },
    { time: '14:44', msg: 'Analyzing Redis 7.2.4 for known CVEs...', type: 'command' },
    { time: '14:46', msg: 'CVE-2023-XXXX potential (unverified)', type: 'info' },
  ],
};

const getAgentConsoleLogs = (agentName: string) => {
  const map: Record<string, string[]> = {
    'Orchestrator': ['Orchestrator'],
    'Recon': ['Recon'],
    'Exploit': ['Exploit'],
    'Research': ['Research'],
  };
  const key = map[agentName]?.[0] || 'Recon';
  return AGENT_CONSOLE_LOGS[key] || [];
};

interface ChatMessage {
  type: 'user' | 'agent' | 'console';
  text: string;
  time: string;
  logType?: string;
}

const AgentChat: React.FC<{
  agent: typeof AGENTS[0];
  onClose: () => void;
}> = ({ agent, onClose }) => {
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'console' | 'details'>('console');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => 
    getAgentConsoleLogs(agent.name).map(log => ({ type: 'console' as const, text: log.msg, time: log.time, logType: log.type }))
  );
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { agents } = useSwarmStore();
  
  const agentData = agents.find(a => a.id === agent.id);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSend = () => {
    if (!message.trim()) return;
    
    const now = new Date();
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    
    setChatHistory(prev => [...prev, { type: 'user', text: message, time: timeStr }]);
    setMessage('');
    
    setTimeout(() => {
      const responses = ['Processing request...', 'Analyzing...', 'Executing task...', 'Gathering intelligence...'];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      const respTime = new Date();
      const respTimeStr = String(respTime.getHours()).padStart(2, '0') + ':' + String(respTime.getMinutes()).padStart(2, '0');
      setChatHistory(prev => [...prev, { type: 'agent', text: randomResponse, time: respTimeStr }]);
    }, 800 + Math.random() * 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <button 
          onClick={onClose}
          className="p-2 hover:bg-[#F6F2EC] rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-[var(--swarm-text-muted)]" />
        </button>
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: agent.colorBg, border: `1px solid ${agent.colorBd}`, color: agent.color }}
          >
            {agent.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--swarm-text)]">{agent.name}</h2>
            <p className="text-xs text-[var(--swarm-text-muted)]">{agent.role}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-[#17864A]/10 border border-[#17864A]/20 rounded-full">
          <span className="w-2 h-2 rounded-full bg-[#17864A] animate-pulse" />
          <span className="text-xs font-medium text-[#17864A]">CONNECTED</span>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('console')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'console' ? 'bg-[var(--swarm-accent)] text-white' : 'bg-[var(--swarm-card)] text-[var(--swarm-text-muted)] border border-[var(--swarm-border)]'
          }`}
        >
          <Terminal size={12} /> Console
        </button>
        <button
          onClick={() => setActiveTab('details')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'details' ? 'bg-[var(--swarm-accent)] text-white' : 'bg-[var(--swarm-card)] text-[var(--swarm-text-muted)] border border-[var(--swarm-border)]'
          }`}
        >
          <FolderOpen size={12} /> Details
        </button>
      </div>

      {activeTab === 'details' ? (
        <div className="flex-1 flex flex-col gap-6 overflow-auto">
          {agent.id === 'orchestrator' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-4 border-b border-[var(--swarm-border)]/50 flex justify-between items-center bg-[var(--swarm-bg)]">
                  <div className="flex items-center gap-2">
                    <GitBranch size={16} className="text-[var(--swarm-accent)]" />
                    <h3 className="font-bold text-[var(--swarm-text)] text-[14px]">Mission Decision Tree</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide text-[var(--swarm-accent)] bg-[var(--swarm-accent)]/10 border-[var(--swarm-accent)]/20 font-bold">
                    Active
                  </span>
                </div>
                <div className="divide-y divide-[var(--swarm-border)] bg-[var(--swarm-card)]">
                  {[
                    { step: '1', action: 'RECON scan complete', result: '847 endpoints', time: '08:35', status: 'done' },
                    { step: '2', action: 'CVE matched (Tomcat)', result: 'CVE-2024-1234', time: '08:41', status: 'done' },
                    { step: '3', action: 'EXPLOIT RCE confirmed', result: ':8443 compromised', time: '08:46', status: 'done' },
                    { step: '4', action: 'Lateral movement', result: 'Enumerating 10.0.0.0/8', time: 'now', status: 'running' },
                    { step: '5', action: 'Pending: Data exfil', result: 'Awaiting task', time: '--:--', status: 'pending' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center p-3 bg-[var(--swarm-card)] hover:bg-[var(--swarm-bg)]/50 transition-colors">
                      <span className="w-6 text-[11px] font-mono font-bold text-[var(--swarm-text-muted)]">{row.step}</span>
                      <div className="flex-1">
                        <div className="text-[12px] font-mono text-[var(--swarm-text)]">{row.action}</div>
                        <div className="text-[10px] font-mono text-[var(--swarm-text-muted)]">{row.result}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide ${
                        row.status === 'done' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
                        row.status === 'running' ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' :
                        'text-[var(--swarm-text-muted)] bg-[var(--swarm-text-muted)]/10 border-[var(--swarm-border)]'
                      }`}>{row.status}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-4 border-b border-[var(--swarm-border)]/50 bg-[var(--swarm-bg)]">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-[var(--swarm-accent)]" />
                    <h3 className="font-bold text-[var(--swarm-text)] text-[14px]">Active Task Delegation</h3>
                  </div>
                  <p className="text-[10px] font-mono font-medium text-[var(--swarm-text-muted)] uppercase tracking-widest mt-1">Agent Task Queue</p>
                </div>
                <div className="divide-y divide-[var(--swarm-border)] bg-[var(--swarm-card)]">
                  {[
                    { agent: 'RECON', task: 'Subdomain enum CT logs', progress: 100, status: 'complete' },
                    { agent: 'EXPLOIT', task: 'Post-exploit enumeration', progress: 72, status: 'running' },
                    { agent: 'OSINT', task: 'CVE-2024-1234 research', progress: 100, status: 'complete' },
                    { agent: 'RECON', task: 'Web crawl api.acme.corp', progress: 100, status: 'complete' },
                  ].map((row, i) => (
                    <div key={i} className="p-3 bg-[var(--swarm-card)]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[12px] font-bold text-[var(--swarm-text)]">{row.agent}</span>
                        <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide ${
                          row.status === 'complete' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
                          'text-amber-500 bg-amber-500/10 border-amber-500/20'
                        }`}>{row.status === 'running' ? 'Running' : row.status}</span>
                      </div>
                      <div className="text-[11px] text-[var(--swarm-text-muted)] mb-2">{row.task}</div>
                      <div className="w-full h-1 bg-[var(--swarm-border)] rounded-full overflow-hidden">
                        <div className="h-full transition-all" style={{ width: `${row.progress}%`, background: 'var(--swarm-accent)' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {agent.id === 'exploit' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-4 border-b border-[var(--swarm-border)]/50 flex justify-between items-center bg-[var(--swarm-bg)]">
                  <div className="flex items-center gap-2">
                    <Terminal size={16} className="text-red-400" />
                    <h3 className="font-bold text-[var(--swarm-text)] text-[14px]">Active Shells / Connections</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide text-emerald-500 bg-emerald-500/10 border-emerald-500/20 font-bold">
                    1 Active
                  </span>
                </div>
                <div className="divide-y divide-[var(--swarm-border)] bg-[var(--swarm-card)]">
                  {[
                    { type: 'Reverse Shell', target: '192.168.0.143:8443', user: 'root (uid=0)', time: '08:46', status: 'active', latency: '12ms' },
                    { type: 'SQLi UNION', target: 'api.acme.corp', user: 'webapp (id=2847)', time: '08:39', status: 'dormant', latency: '-' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center p-3 bg-[var(--swarm-card)] hover:bg-[var(--swarm-bg)]/50 transition-colors">
                      <Skull size={16} className={row.status === 'active' ? 'text-red-400' : 'text-gray-500'} />
                      <div className="flex-1 ml-3">
                        <div className="text-[12px] font-mono font-bold text-[var(--swarm-text)]">{row.type}</div>
                        <div className="text-[10px] font-mono text-[var(--swarm-text-muted)]">{row.target} · {row.user}</div>
                      </div>
                      <div className="text-right">
                        <span className={`block px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide ${
                          row.status === 'active' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
                          'text-gray-500 bg-gray-500/10 border-gray-500/20'
                        }`}>{row.status}</span>
                        <span className="text-[10px] font-mono text-[var(--swarm-text-muted)]">{row.latency}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-4 border-b border-[var(--swarm-border)]/50 bg-[var(--swarm-bg)]">
                  <div className="flex items-center gap-2">
                    <Cpu size={16} className="text-red-400" />
                    <h3 className="font-bold text-[var(--swarm-text)] text-[14px]">Weaponization Queue</h3>
                  </div>
                  <p className="text-[10px] font-mono font-medium text-[var(--swarm-text-muted)] uppercase tracking-widest mt-1">Ready Exploits</p>
                </div>
                <div className="divide-y divide-[var(--swarm-border)] bg-[var(--swarm-card)]">
                  {[
                    { cve: 'CVE-2024-1234', target: 'Apache Tomcat 10.1.31', severity: 'Critical', cvss: 9.8, status: 'weaponized' },
                    { cve: 'CVE-2023-4567', target: 'nginx 1.25.3', severity: 'Medium', cvss: 6.1, status: 'ready' },
                    { cve: 'CVE-2023-8910', target: 'MySQL 8.0.36', severity: 'High', cvss: 7.5, status: 'testing' },
                    { cve: 'SQLi-UNION', target: 'api.acme.corp/v2', severity: 'High', cvss: 8.2, status: 'weaponized' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center p-3 bg-[var(--swarm-card)] hover:bg-[var(--swarm-bg)]/50 transition-colors">
                      <div className="flex-1">
                        <div className="text-[12px] font-mono font-bold text-[var(--swarm-text)]">{row.cve}</div>
                        <div className="text-[10px] font-mono text-[var(--swarm-text-muted)]">{row.target}</div>
                      </div>
                      <div className="text-right">
                        <span className={`block px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide ${
                          row.status === 'weaponized' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                          row.status === 'ready' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
                          'text-amber-500 bg-amber-500/10 border-amber-500/20'
                        }`}>{row.status}</span>
                        <span className="text-[10px] font-mono text-[var(--swarm-text-muted)]">CVSS {row.cvss}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {agent.id === 'osint' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-4 border-b border-[var(--swarm-border)]/50 flex justify-between items-center bg-[var(--swarm-bg)]">
                  <div className="flex items-center gap-2">
                    <Shield size={16} className="text-emerald-400" />
                    <h3 className="font-bold text-[var(--swarm-text)] text-[14px]">CVE Match Confidence</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide text-emerald-500 bg-emerald-500/10 border-emerald-500/20 font-bold">
                    3 Matched
                  </span>
                </div>
                <div className="divide-y divide-[var(--swarm-border)] bg-[var(--swarm-card)]">
                  {[
                    { cve: 'CVE-2024-1234', product: 'Apache Tomcat', version: '10.1.31', confidence: 98, cvss: 9.8, status: 'confirmed' },
                    { cve: 'CVE-2023-4567', product: 'nginx', version: '1.25.3', confidence: 65, cvss: 6.1, status: 'possible' },
                    { cve: 'CVE-2023-8910', product: 'MySQL', version: '8.0.36', confidence: 42, cvss: 7.5, status: 'unlikely' },
                  ].map((row, i) => (
                    <div key={i} className="p-3 bg-[var(--swarm-card)] hover:bg-[var(--swarm-bg)]/50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <div className="text-[12px] font-mono font-bold text-[var(--swarm-text)]">{row.cve}</div>
                          <div className="text-[10px] font-mono text-[var(--swarm-text-muted)]">{row.product} {row.version}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide ${
                          row.status === 'confirmed' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
                          row.status === 'possible' ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' :
                          'text-gray-500 bg-gray-500/10 border-gray-500/20'
                        }`}>{row.status}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--swarm-border)] rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${row.confidence}%` }}></div>
                        </div>
                        <span className="text-[10px] font-mono text-[var(--swarm-text-muted)]">{row.confidence}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-4 border-b border-[var(--swarm-border)]/50 bg-[var(--swarm-bg)]">
                  <div className="flex items-center gap-2">
                    <Key size={16} className="text-emerald-400" />
                    <h3 className="font-bold text-[var(--swarm-text)] text-[14px]">Leaked Credentials Stream</h3>
                  </div>
                  <p className="text-[10px] font-mono font-medium text-[var(--swarm-text-muted)] uppercase tracking-widest mt-1">Active Feeds</p>
                </div>
                <div className="divide-y divide-[var(--swarm-border)] bg-[var(--swarm-card)]">
                  {[
                    { source: 'GitHub', repo: 'acme-corp/deploy-scripts', creds: '3 found', severity: 'High', time: '08:34' },
                    { source: 'Pastebin', query: 'acme.corp admin', creds: '0 found', severity: 'N/A', time: '07:15' },
                    { source: 'Dark Web', query: 'acme corp data', creds: '0 found', severity: 'N/A', time: '06:00' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center p-3 bg-[var(--swarm-card)] hover:bg-[var(--swarm-bg)]/50 transition-colors">
                      <Search size={16} className="text-[var(--swarm-accent)]" />
                      <div className="flex-1 ml-3">
                        <div className="text-[12px] font-mono font-bold text-[var(--swarm-text)]">{row.source}</div>
                        <div className="text-[10px] font-mono text-[var(--swarm-text-muted)]">{row.repo || row.query}</div>
                      </div>
                      <div className="text-right">
                        <span className={`block px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide ${
                          row.severity === 'High' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                          row.severity === 'N/A' ? 'text-gray-500 bg-gray-500/10 border-gray-500/20' :
                          'text-amber-500 bg-amber-500/10 border-amber-500/20'
                        }`}>{row.severity}</span>
                        <span className="text-[10px] font-mono text-[var(--swarm-text-muted)]">{row.creds} · {row.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {agent.id === 'recon' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-4 border-b border-[var(--swarm-border)]/50 flex justify-between items-center bg-[var(--swarm-bg)]">
                  <div>
                    <h3 className="font-bold text-[var(--swarm-text)] text-[14px]">Open Ports</h3>
                    <p className="text-[11px] font-mono text-[var(--swarm-text-muted)] mt-0.5">192.168.0.0/24</p>
                  </div>
                  <span className="px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide text-amber-500 bg-amber-500/10 border-amber-500/20 font-bold">
                    22 Open
                  </span>
                </div>
                <table className="w-full text-left border-collapse bg-[var(--swarm-card)]">
                  <thead>
                    <tr className="border-b border-[var(--swarm-border)] text-[10px] font-mono font-bold text-[var(--swarm-text-muted)] tracking-widest uppercase bg-[var(--swarm-bg)]">
                      <th className="px-5 py-3 w-16">Port</th>
                      <th className="px-5 py-3 w-28">Service</th>
                      <th className="px-5 py-3">Banner</th>
                      <th className="px-5 py-3 w-28 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--swarm-border)]">
                    {[
                      { port: '22', svc: 'ssh', banner: 'OpenSSH 8.9p1 Ubuntu', status: 'Open', color: 'green' },
                      { port: '80', svc: 'http', banner: 'nginx/1.25.3', status: 'Open', color: 'green' },
                      { port: '443', svc: 'ssl/http', banner: 'nginx/1.25.3 · TLSv1.3', status: 'Open', color: 'green' },
                      { port: '3306', svc: 'mysql', banner: 'MySQL 8.0.36-0ubuntu0', status: 'Open', color: 'green' },
                      { port: '6379', svc: 'redis', banner: 'Redis 7.2.4 · no auth', status: 'Exposed', color: 'red' },
                      { port: '8443', svc: 'ssl/http', banner: 'Apache-Coyote/1.1 Tomcat', status: 'Exploited', color: 'red' },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-[var(--swarm-bg)]">
                        <td className="px-5 py-3 text-[12px] font-mono font-bold text-[var(--swarm-text)]">{row.port}</td>
                        <td className="px-5 py-3 text-[12px] font-mono text-[var(--swarm-text-muted)]">{row.svc}</td>
                        <td className="px-5 py-3 text-[12px] font-mono text-[var(--swarm-text-muted)]">{row.banner}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide flex inline-flex items-center justify-center w-[75px]
                            ${row.color === 'green' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}
                          `}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-4 border-b border-[var(--swarm-border)]/50 bg-[var(--swarm-bg)]">
                  <h3 className="font-bold text-[var(--swarm-text)] text-[14px]">Technology Stack</h3>
                  <p className="text-[10px] font-mono font-medium text-[var(--swarm-text-muted)] uppercase tracking-widest mt-1">Fingerprinted Components</p>
                </div>
                <div className="divide-y divide-[var(--swarm-border)] bg-[var(--swarm-card)]">
                  {[
                    { icon: <Globe size={16} className="text-blue-400" />, name: 'nginx/1.25.3', badge: 'Web server', bColor: 'gray', sub: 'No CVEs', subColor: 'text-[var(--swarm-text-muted)]' },
                    { icon: <Coffee size={16} className="text-amber-600" />, name: 'Apache Tomcat 10.1.31', badge: 'Vulnerable', bColor: 'red', sub: 'CVE-2024-1234', subColor: 'text-red-400' },
                    { icon: <Circle fill="currentColor" size={14} className="text-red-400" />, name: 'Redis 7.2.4', badge: 'Exposed', bColor: 'amber', sub: 'No auth', subColor: 'text-[var(--swarm-text-muted)]' },
                    { icon: <Database size={16} className="text-blue-400" />, name: 'MySQL 8.0.36', badge: 'Database', bColor: 'gray', sub: 'Checking...', subColor: 'text-[var(--swarm-text-muted)]' },
                  ].map((tech, i) => (
                    <div key={i} className="flex items-center p-3 hover:bg-[var(--swarm-bg)]/50 transition-colors">
                      <div className="w-8 flex justify-center shrink-0">{tech.icon}</div>
                      <div className="flex-1 text-[13px] font-mono font-medium text-[var(--swarm-text)]">{tech.name}</div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide ${
                          tech.bColor === 'gray' ? 'text-gray-500 bg-gray-500/10 border-gray-500/20' :
                          tech.bColor === 'red' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                          'text-amber-500 bg-amber-500/10 border-amber-500/20'}
                        `}>
                          {tech.badge}
                        </span>
                        <span className={`text-[11px] font-mono text-right w-24 ${tech.subColor}`}>{tech.sub}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {agent.id === 'recon' && (
            <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-[var(--swarm-border)]/50 flex justify-between items-center bg-[var(--swarm-bg)]">
                <div>
                  <h3 className="font-bold text-[var(--swarm-text)] text-[14px]">Discovered Subdomains</h3>
                  <p className="text-[10px] font-mono font-medium text-[var(--swarm-text-muted)] uppercase tracking-widest mt-1">Via CT Logs, DNS Brute, OSINT</p>
                </div>
                <span className="px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide text-emerald-500 bg-emerald-500/10 border-emerald-500/20 font-bold">
                  28 Found
                </span>
              </div>
              <div className="divide-y divide-[var(--swarm-border)] bg-[var(--swarm-card)]">
                {[
                  { dom: 'acme.corp', badge: 'Main', bColor: 'gray', ip: '192.168.0.1' },
                  { dom: 'api.acme.corp', badge: 'SQLi found', bColor: 'red', ip: '192.168.0.2' },
                  { dom: 'admin.acme.corp', badge: 'Default creds', bColor: 'amber', ip: '192.168.0.1' },
                  { dom: 'internal.acme.corp', badge: 'Internal', bColor: 'gray', ip: '10.0.0.1' },
                  { dom: 'staging.acme.corp', badge: 'Staging', bColor: 'gray', ip: '192.168.0.5' },
                  { dom: 'jenkins.acme.corp', badge: 'No auth', bColor: 'amber', ip: '192.168.0.8' },
                ].map((sub, i) => (
                  <div key={i} className="flex items-center p-3.5 hover:bg-[var(--swarm-bg)]/50 transition-colors">
                    <div className="w-8 flex justify-center shrink-0">
                      <Globe size={16} className="text-blue-400" />
                    </div>
                    <div className="flex-1 text-[13px] font-mono font-medium text-blue-400">{sub.dom}</div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide
                        ${sub.bColor === 'gray' ? 'text-gray-500 bg-gray-500/10 border-gray-500/20' :
                          sub.bColor === 'red' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                          'text-amber-500 bg-amber-500/10 border-amber-500/20'}
                      `}>
                        {sub.badge}
                      </span>
                      <span className="text-[12px] font-mono text-[var(--swarm-text-muted)] text-right w-24">{sub.ip}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 bg-[#15120F] rounded-lg flex flex-col overflow-hidden border border-white/10">
        <div className="px-4 py-3 border-b border-white/10 bg-[#1A1714] flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/60">
            <Terminal size={14} />
            <span className="text-xs font-mono">Agent Console</span>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-white/10 text-white/60 rounded text-[10px] font-mono hover:bg-white/20 transition-colors flex items-center gap-1">
              <Play size={10} /> Sync
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto space-y-2">
          {chatHistory.length === 0 ? (
            <div className="text-center text-white/30 py-8">
              <p className="text-sm">Send a message to {agent.name}</p>
              <p className="text-xs mt-2 opacity-60">Ask what they're working on or request an update</p>
            </div>
          ) : (
            chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded px-2 py-1 ${
                  msg.type === 'user' 
                    ? 'bg-[#C06010] text-white' 
                    : msg.type === 'console'
                      ? 'bg-transparent text-white/90'
                      : 'bg-white/10 text-white/90'
                }`}>
                  {msg.type === 'console' ? (
                    <div className="flex gap-2">
                      <span className="text-gray-500 shrink-0 text-[10px] w-8">{msg.time}</span>
                      <span className={`text-[11px] ${
                        msg.logType === 'success' ? 'text-emerald-400' :
                        msg.logType === 'alert' ? 'text-red-400' :
                        msg.logType === 'command' ? 'text-amber-400' :
                        'text-gray-300'
                      }`}>{msg.text}</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-[10px] opacity-50 mb-0.5">{msg.time}</div>
                      <div className="text-xs">{msg.text}</div>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>
        
        <div className="p-3 bg-[#0D0B08] border-t border-white/5">
          <div className="flex items-center gap-2 bg-[#1A1714] rounded-lg px-3 py-2 border border-white/10">
            <span className="text-amber-500 font-mono text-sm">❯</span>
            <input 
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agent.name}...`}
              className="flex-1 bg-transparent text-white text-sm font-mono placeholder-white/30 outline-none"
            />
            <button 
              onClick={handleSend}
              disabled={!message.trim()}
              className="p-1.5 text-amber-500 hover:text-amber-400 disabled:opacity-30"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
};

export const AgentsPanel: React.FC = () => {
  const { agents } = useSwarmStore();
  const [selectedAgent, setSelectedAgent] = useState<typeof AGENTS[0] | null>(null);

  if (selectedAgent) {
    return <AgentChat agent={selectedAgent} onClose={() => setSelectedAgent(null)} />;
  }

  return (
    <div className="h-full">
      <div className="mb-6">
        <h2 className="text-2xl font-light tracking-tight text-[var(--swarm-text)]" style={{ letterSpacing: '-0.025em' }}>
          Agent <em style={{ fontStyle: 'italic', color: 'var(--swarm-accent)' }}>Swarm</em>
        </h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12 h-full">
        {AGENTS.map((agent) => {
          const data = agents.find(a => a.id === agent.id);
          const timeline = TIMELINES[agent.id as keyof typeof TIMELINES] || [];
          const currentTask = CURRENT_TASKS[agent.id as keyof typeof CURRENT_TASKS] || 'Initializing...';
          
          return (
            <div 
              key={agent.id}
              className="flex flex-col bg-[var(--swarm-card)] rounded-lg border border-[var(--swarm-border)] overflow-hidden cursor-pointer hover:shadow-lg transition-all"
              style={{ borderRadius: 8 }}
              onClick={() => setSelectedAgent(agent)}
            >
              <div className="p-4 flex items-start gap-3 border-b border-[var(--swarm-border)]/50">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ 
                    background: agent.colorBg, 
                    border: `1px solid ${agent.colorBd}`,
                    color: agent.color
                  }}
                >
                  {agent.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[var(--swarm-text)] text-[0.9rem]" style={{ letterSpacing: '-0.02em' }}>{agent.name}</div>
                  <div className="text-[0.73rem] text-[var(--swarm-text-muted)] mb-1.5">{agent.role}</div>
                  <span className="font-mono text-[0.58rem] px-2 py-0.5 rounded bg-[var(--swarm-bg)] border border-[var(--swarm-border)] text-[var(--swarm-text-muted)]">
                    {agent.model}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <div 
                    className="font-light text-[1.75rem] text-[var(--swarm-text)]" 
                    style={{ 
                      letterSpacing: '-0.03em',
                      lineHeight: 1 
                    }}
                  >
                    {data?.prog ? `${data.prog}%` : agent.stats}
                  </div>
                  <div className="text-[0.68rem] text-[var(--swarm-text-muted)]">{data?.task ? data.task.split(' ').slice(0,3).join(' ') : agent.statsLabel}</div>
                </div>
              </div>
              
              <div className="p-4">
                <div 
                  className="p-2.5 rounded-md mb-3 text-[0.775rem] text-[var(--swarm-text-muted)] leading-relaxed bg-[var(--swarm-bg)]"
                >
                  <strong 
                    className="text-[var(--swarm-text)] text-[0.72rem] uppercase tracking-wider block mb-0.5" 
                    style={{ letterSpacing: '0.02em' }}
                  >
                    Current Task
                  </strong>
                  {currentTask}
                </div>
                
                <div className="flex flex-col">
                  {timeline.map((item, i) => (
                    <div 
                      key={i} 
                      className="flex items-start gap-2.5 py-1.5 border-b border-[var(--swarm-border)]/50 relative"
                    >
                      <span 
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
                        style={{ 
                          background: item.status === 'run' ? '#C06010' : item.status === 'done' ? '#17864A' : '#C13329',
                          border: `1.5px solid ${item.status === 'run' ? '#C06010' : item.status === 'done' ? '#17864A' : '#C13329'}`,
                          animation: item.status === 'run' ? 'pulse 1.2s ease-in-out infinite' : 'none'
                        }} 
                      />
                      <span className="text-[0.775rem] text-[var(--swarm-text-muted)] leading-snug flex-1" style={{ lineHeight: 1.4 }}>
                        {item.msg}
                      </span>
                      <span 
                        className="font-mono text-[0.58rem] flex-shrink-0 pt-0.5 text-[var(--swarm-text-muted)]" 
                      >
                        {item.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};