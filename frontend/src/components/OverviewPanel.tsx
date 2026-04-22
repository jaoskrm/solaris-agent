import React, { useRef } from 'react';
import { useSwarmStore } from '../store/swarm';
import { Terminal, Activity, AlertTriangle, Shield, Zap, Search, Microscope, Target } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

const AGENT_CONFIG = [
  { id: 'orchestrator', name: 'Orchestrator', color: '#C06010' },
  { id: 'recon', name: 'Recon', color: '#2558D9' },
  { id: 'exploit', name: 'Exploit', color: '#C13329' },
  { id: 'osint', name: 'Research', color: '#17864A' },
];

const agentColors: Record<string, string> = {
  'Orchestrator': '#C06010',
  'Recon': '#2558D9',
  'Exploit': '#C13329',
  'Research': '#17864A',
  'SYS': '#6B6560',
};

interface SessionProgressProps {
  value: number;
  className?: string;
}

const SessionProgress: React.FC<SessionProgressProps> = ({ value = 56, className = '' }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    gsap.fromTo(barRef.current, 
      { width: '0%' }, 
      { width: `${value}%`, duration: 1.5, ease: 'power3.out' }
    );

    const counter = { val: 0 };
    gsap.to(counter, {
      val: value,
      duration: 1.5,
      ease: 'power3.out',
      onUpdate: () => {
        if (numberRef.current) {
          numberRef.current.innerText = `${Math.round(counter.val)}%`;
        }
      }
    });
  }, [value]);

  return (
    <div className={`w-full flex flex-col gap-2 ${className}`}>
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-mono font-bold tracking-widest text-[var(--swarm-text-muted)] uppercase">
          Session Progress
        </span>
        <span ref={numberRef} className="text-[11px] font-mono font-bold text-[var(--swarm-text)]">
          0%
        </span>
      </div>
      <div className="w-full h-1.5 bg-[#1A1714]/10 rounded-full overflow-hidden shadow-inner">
        <div 
          ref={barRef}
          className="h-full bg-[#D97706] rounded-full relative"
          style={{ width: '0%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
        </div>
      </div>
    </div>
  );
};

export const OverviewPanel: React.FC = () => {
  const { logs, agents, findings, globalRiskScore } = useSwarmStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const executionLogs = logs.slice(-12).reverse().map((log) => ({
    time: log.time,
    source: log.agent,
    msg: log.msg,
    type: log.msg.includes('★') ? 'success' : log.type === 'system' ? 'system' : 'info',
  }));

  const overallProgress = Math.round(agents.reduce((acc, a) => acc + a.prog, 0) / agents.length);

  return (
    <div ref={containerRef} className="space-y-4 p-1">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl p-5 shadow-sm">
          <div className="flex items-baseline mb-2">
            <span className="text-4xl font-serif text-[var(--swarm-text)]">{findings.length}</span>
            <span className="text-3xl font-serif text-[#D97706]">+</span>
          </div>
          <div className="text-[11px] font-mono font-bold tracking-widest uppercase text-[var(--swarm-text-muted)]">Total Findings</div>
          <div className="text-[11px] font-mono text-[#DC2626] mt-2">↑ {findings.filter(f => f.sev === 'Critical').length} critical</div>
        </div>
        <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl p-5 shadow-sm">
          <div className="flex items-baseline mb-2">
            <span className="text-4xl font-serif text-[var(--swarm-text)]">3</span>
          </div>
          <div className="text-[11px] font-mono font-bold tracking-widest uppercase text-[var(--swarm-text-muted)]">Critical Vulnerabilities</div>
          <div className="text-[11px] font-mono text-[#DC2626] mt-2">3 need immediate action</div>
        </div>
        <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl p-5 shadow-sm">
          <div className="flex items-baseline mb-2">
            <span className="text-4xl font-serif text-[var(--swarm-text)]">3</span>
            <span className="text-xl font-serif text-[var(--swarm-text)]/50">/8</span>
          </div>
          <div className="text-[11px] font-mono font-bold tracking-widest uppercase text-[var(--swarm-text-muted)]">Exploits Successful</div>
          <div className="text-[11px] font-mono text-[#059669] mt-2">✓ RCE confirmed on :8443</div>
        </div>
        <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl p-5 shadow-sm">
          <div className="flex items-baseline mb-2">
            <span className="text-4xl font-serif text-[var(--swarm-text)]">847</span>
          </div>
          <div className="text-[11px] font-mono font-bold tracking-widest uppercase text-[var(--swarm-text-muted)]">Endpoints Discovered</div>
          <div className="text-[11px] font-mono text-[var(--swarm-text-muted)] mt-2">412 tested · 435 queued</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        <div className="flex flex-col gap-6 h-full">
          <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm flex-1">
            <div className="flex items-center justify-between p-4 border-b border-[var(--swarm-border)]/50">
              <div>
                <h3 className="font-bold text-[var(--swarm-text)] text-sm">Live Agent Feed</h3>
                <p className="text-[10px] font-mono font-medium text-[var(--swarm-text-muted)] uppercase tracking-widest">Real-time Activity</p>
              </div>
              <div className="flex items-center gap-2 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-mono font-bold text-emerald-500 uppercase">Live</span>
              </div>
            </div>
            <div className="divide-y divide-[#1A1714]/5">
              {executionLogs.map((log, i) => (
                <div key={i} className="flex gap-4 p-3 text-[13px] hover:bg-[var(--swarm-bg)] transition-colors">
                  <div className="w-16 shrink-0 font-mono font-bold text-[10px] uppercase mt-0.5" style={{ color: agentColors[log.source] || '#6B6560' }}>
                    {log.source}
                  </div>
                  <div className="flex-1 text-[var(--swarm-text-muted)] leading-tight">
                    <span className={log.type === 'success' ? 'text-emerald-600 font-bold' : ''}>
                      {log.msg}
                    </span>
                  </div>
                  <div className="shrink-0 font-mono text-[11px] text-[var(--swarm-text-muted)]">{log.time.split(':').slice(0,2).join(':')}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between p-4 border-b border-[var(--swarm-border)]/50">
              <h3 className="font-bold text-[var(--swarm-text)] text-sm">Recent Findings</h3>
              <span className="text-[10px] font-mono font-bold bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded uppercase">3 Critical</span>
            </div>
            <div className="divide-y divide-[#1A1714]/5">
              {findings.slice(0, 6).map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 hover:bg-[var(--swarm-bg)] transition-colors">
<span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide font-bold ${
                      item.sev === 'Critical' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                      item.sev === 'High' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                      item.sev === 'Medium' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                      'bg-[var(--swarm-text-muted)]/10 text-[var(--swarm-text-muted)] border border-[var(--swarm-border)]'
                    }`}>{item.sev}</span>
                  <span className="flex-1 text-[13px] text-[var(--swarm-text)] truncate">{item.title}</span>
                  <span className="text-[11px] font-mono text-[var(--swarm-text-muted)]">{item.loc}</span>
                  <span className="text-[11px] font-mono font-bold text-[var(--swarm-text)] w-6 text-right shrink-0">{item.cvss}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 h-full">
          <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl p-4 shadow-sm flex-1">
            <h3 className="font-bold text-[var(--swarm-text)] text-sm mb-1">Agent Status</h3>
            <p className="text-[10px] font-mono font-medium text-[var(--swarm-text-muted)] uppercase tracking-widest mb-4">4 Agents Running</p>
            <div className="space-y-3">
              {agents.map((agent) => {
                const config = AGENT_CONFIG.find(c => c.id === agent.id);
                return (
                  <div key={agent.id} className="p-3 border border-[var(--swarm-border)] rounded-lg bg-[var(--swarm-bg)]/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-[var(--swarm-text)] text-[13px]">{agent.name}</span>
                      <span className="text-[10px] font-mono font-bold bg-[var(--swarm-accent)]/10 text-[var(--swarm-accent)] border border-[var(--swarm-accent)]/20 px-2 py-1 rounded uppercase tracking-widest hover:bg-[var(--swarm-accent)]/20 transition-colors">Running</span>
                    </div>
                    <p className="text-[11px] text-[var(--swarm-text-muted)] leading-tight mb-3 line-clamp-2">{agent.task}</p>
                    <div className="w-full h-1 bg-[#1A1714]/10 rounded-full overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${agent.prog}%`, background: config?.color || '#6B6560' }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-[#0A0A0A] border border-[var(--swarm-border)] rounded-xl overflow-hidden shadow-sm flex flex-col flex-1 min-h-0">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-[#111110]">
              <div className="flex items-center gap-2 text-gray-300">
                <Terminal size={14} className="text-amber-500" />
                <span className="text-[11px] font-mono font-bold tracking-widest uppercase">Execution Log</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-mono font-bold text-emerald-500 uppercase tracking-widest">LIVE</span>
              </div>
            </div>
            <div className="flex-1 bg-[#0A0A0A] p-3 overflow-y-auto space-y-1 text-[11px] font-mono min-h-0">
              {executionLogs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-gray-500 shrink-0 w-12">{log.time.split(':').slice(0,2).join(':')}</span>
                  <div className="flex-1 min-w-0">
                    <span style={{ color: agentColors[log.source] || '#6B6560' }} className="font-bold">[{log.source}]</span>
                    <span className={`ml-2 text-gray-300 ${
                      log.type === 'success' ? 'text-emerald-400' : 
                      log.type === 'alert' ? 'text-red-400' : 
                      'text-gray-500'
                    }`}>{log.msg}</span>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 text-amber-500 pt-2 border-t border-white/5">
                <span className="shrink-0 w-12">--:--</span>
                <span className="animate-pulse">_</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl p-4 shadow-sm">
        <SessionProgress value={overallProgress} />
      </div>
    </div>
  );
};