import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send } from 'lucide-react';

const commandLogs = [
  { time: '08:30', source: 'SYS', msg: 'Mission 34a started — 2026-04-16 08:30:01 UTC', type: 'system' },
  { time: '08:30', source: 'RECON', msg: 'nmap -sV -p- --min-rate 5000 -oX scan.xml 192.168.0.0/24', type: 'command' },
  { time: '08:32', source: 'RECON', msg: 'Starting Nmap 7.94 — 22 open ports across 6 hosts', type: 'info' },
  { time: '08:33', source: 'RECON', msg: 'ffuf -w /usr/share/wordlists/dirbuster -u https://acme.corp/FUZZ', type: 'command' },
  { time: '08:35', source: 'RECON', msg: '847 endpoints discovered (200: 312, 301: 102, 403: 433)', type: 'info' },
  { time: '08:36', source: 'RESEARCH', msg: 'cve-search --product tomcat --version 10.1.31', type: 'command' },
  { time: '08:38', source: 'RESEARCH', msg: '★ CVE-2024-1234 (CVSS 9.8) — Apache Tomcat RCE', type: 'success' },
  { time: '08:40', source: 'EXPLOIT', msg: 'sqlmap -u "https://api.acme.corp/v2/users?id=1" --dbs', type: 'command' },
  { time: '08:42', source: 'EXPLOIT', msg: '★ SQL injection verified — 14 databases extracted', type: 'success' },
  { time: '08:45', source: 'EXPLOIT', msg: 'python3 cve-2024-1234.py --target :8443 --lhost 10.0.0.1', type: 'command' },
  { time: '08:46', source: 'EXPLOIT', msg: '★ SHELL OBTAINED — uid=0(root) gid=0(root)', type: 'success' },
  { time: '08:48', source: 'ORCH', msg: 'Coordinating lateral movement from compromised host...', type: 'system' },
];

const agentColors: Record<string, string> = {
  'SYS': '#6B6560',
  'ORCH': '#C06010',
  'RECON': '#2558D9',
  'EXPLOIT': '#C13329',
  'RESEARCH': '#17864A',
};

export const CommandsPanel: React.FC = () => {
  const [input, setInput] = useState('');
  const terminalRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState(commandLogs);

  const handleSend = () => {
    if (!input.trim()) return;
    const newLog = {
      time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      source: 'ORCH',
      msg: input,
      type: 'command'
    };
    setLogs([...logs, newLog]);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-[1600px] h-full flex flex-col pb-8">
      <div className="mb-6 shrink-0">
        <h1 className="text-4xl text-[#1A1714] font-serif">
          Command <span className="italic text-[#D97706]/80">Log</span>
        </h1>
      </div>

      <div className="flex-1 bg-[#15120F] rounded-xl border border-[#1A1714]/20 shadow-2xl overflow-hidden flex flex-col">
        <div className="h-10 border-b border-white/10 flex items-center justify-between px-4 sticky top-0 bg-[#15120F] z-10 shrink-0">
          <div className="flex items-center gap-4">
             <div className="flex gap-1.5">
               <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
               <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
               <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
             </div>
             <span className="text-[11px] font-mono text-gray-500">solaris-agent — mission-34a · shell</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
            <span className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">Recording</span>
          </div>
        </div>

        <div ref={terminalRef} className="flex-1 p-6 font-mono text-[12px] leading-relaxed text-gray-400 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="mb-1">
              <span className="text-gray-500">[{log.source}]</span>{' '}
              <span className={
                log.type === 'command' ? 'text-[#D97706]' :
                log.type === 'success' ? 'text-[#059669]' :
                log.type === 'info' ? 'text-gray-300' :
                'text-gray-400'
              }>{log.msg}</span>
            </div>
          ))}
        </div>

        <div className="p-3 bg-[#0D0B08] border-t border-white/10 shrink-0">
          <div className="flex items-center gap-2 bg-[#1A1714] rounded-lg px-3 py-2 border border-white/10">
            <span className="text-amber-500 font-mono text-sm">❯</span>
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send command to orchestrator..."
              className="flex-1 bg-transparent text-white text-sm font-mono placeholder-white/30 outline-none"
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-1.5 text-amber-500 hover:text-amber-400 disabled:opacity-30"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};