import React, { useRef, useState } from 'react';
import { PanelHeader } from './Shared';
import { FileText, Download, TrendingUp, Target, Shield, Zap, Search, Eye } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

const REPORTS = [
  { id: 1, name: 'Executive Summary Q1', type: 'PDF Document', by: 'System Auto', date: '2026-04-19', size: '2.4 MB' },
  { id: 2, name: 'Vulnerability Assessment', type: 'PDF Document', by: 'Orchestrator', date: '2026-04-18', size: '4.1 MB' },
  { id: 3, name: 'Penetration Test Results', type: 'PDF Document', by: 'Exploit Agent', date: '2026-04-17', size: '3.8 MB' },
  { id: 4, name: 'Network Analysis Report', type: 'PDF Document', by: 'Recon Agent', date: '2026-04-16', size: '2.9 MB' },
  { id: 5, name: 'Weekly Threat Brief', type: 'PDF Document', by: 'Research Agent', date: '2026-04-15', size: '1.2 MB' },
];

const AGENT_ACTIVITY_BY_REPORT: Record<number, { time: string; Recon: number; OSINT: number; Exploit: number; Orchestrator: number }[]> = {
  1: [
    { time: '00:00', Recon: 15, OSINT: 5, Exploit: 0, Orchestrator: 8 },
    { time: '02:00', Recon: 35, OSINT: 12, Exploit: 2, Orchestrator: 15 },
    { time: '04:00', Recon: 58, OSINT: 25, Exploit: 5, Orchestrator: 22 },
    { time: '06:00', Recon: 72, OSINT: 38, Exploit: 8, Orchestrator: 28 },
    { time: '08:00', Recon: 65, OSINT: 45, Exploit: 15, Orchestrator: 35 },
    { time: '10:00', Recon: 45, OSINT: 52, Exploit: 28, Orchestrator: 42 },
    { time: '12:00', Recon: 30, OSINT: 48, Exploit: 42, Orchestrator: 55 },
    { time: '14:00', Recon: 18, OSINT: 55, Exploit: 58, Orchestrator: 68 },
    { time: '16:00', Recon: 12, OSINT: 42, Exploit: 72, Orchestrator: 75 },
    { time: '18:00', Recon: 8, OSINT: 35, Exploit: 85, Orchestrator: 82 },
    { time: '20:00', Recon: 5, OSINT: 28, Exploit: 92, Orchestrator: 88 },
    { time: '22:00', Recon: 3, OSINT: 18, Exploit: 95, Orchestrator: 92 },
    { time: '24:00', Recon: 2, OSINT: 12, Exploit: 98, Orchestrator: 95 },
  ],
  2: [
    { time: '00:00', Recon: 20, OSINT: 8, Exploit: 0, Orchestrator: 10 },
    { time: '02:00', Recon: 45, OSINT: 15, Exploit: 3, Orchestrator: 18 },
    { time: '04:00', Recon: 68, OSINT: 28, Exploit: 7, Orchestrator: 25 },
    { time: '06:00', Recon: 82, OSINT: 42, Exploit: 12, Orchestrator: 32 },
    { time: '08:00', Recon: 75, OSINT: 55, Exploit: 20, Orchestrator: 40 },
    { time: '10:00', Recon: 55, OSINT: 62, Exploit: 35, Orchestrator: 50 },
    { time: '12:00', Recon: 38, OSINT: 58, Exploit: 48, Orchestrator: 62 },
    { time: '14:00', Recon: 25, OSINT: 65, Exploit: 62, Orchestrator: 75 },
    { time: '16:00', Recon: 18, OSINT: 52, Exploit: 78, Orchestrator: 82 },
    { time: '18:00', Recon: 12, OSINT: 42, Exploit: 88, Orchestrator: 88 },
    { time: '20:00', Recon: 8, OSINT: 32, Exploit: 94, Orchestrator: 92 },
    { time: '22:00', Recon: 5, OSINT: 22, Exploit: 97, Orchestrator: 95 },
    { time: '24:00', Recon: 3, OSINT: 15, Exploit: 99, Orchestrator: 98 },
  ],
  3: [
    { time: '00:00', Recon: 10, OSINT: 3, Exploit: 2, Orchestrator: 5 },
    { time: '02:00', Recon: 28, OSINT: 10, Exploit: 5, Orchestrator: 12 },
    { time: '04:00', Recon: 48, OSINT: 20, Exploit: 12, Orchestrator: 20 },
    { time: '06:00', Recon: 62, OSINT: 32, Exploit: 18, Orchestrator: 28 },
    { time: '08:00', Recon: 55, OSINT: 40, Exploit: 28, Orchestrator: 35 },
    { time: '10:00', Recon: 40, OSINT: 45, Exploit: 38, Orchestrator: 45 },
    { time: '12:00', Recon: 28, OSINT: 42, Exploit: 52, Orchestrator: 55 },
    { time: '14:00', Recon: 18, OSINT: 48, Exploit: 65, Orchestrator: 65 },
    { time: '16:00', Recon: 12, OSINT: 38, Exploit: 75, Orchestrator: 72 },
    { time: '18:00', Recon: 8, OSINT: 30, Exploit: 82, Orchestrator: 78 },
    { time: '20:00', Recon: 5, OSINT: 22, Exploit: 88, Orchestrator: 82 },
    { time: '22:00', Recon: 3, OSINT: 15, Exploit: 92, Orchestrator: 88 },
    { time: '24:00', Recon: 2, OSINT: 10, Exploit: 95, Orchestrator: 92 },
  ],
  4: [
    { time: '00:00', Recon: 25, OSINT: 10, Exploit: 0, Orchestrator: 12 },
    { time: '02:00', Recon: 52, OSINT: 20, Exploit: 2, Orchestrator: 20 },
    { time: '04:00', Recon: 78, OSINT: 35, Exploit: 5, Orchestrator: 30 },
    { time: '06:00', Recon: 92, OSINT: 48, Exploit: 10, Orchestrator: 40 },
    { time: '08:00', Recon: 85, OSINT: 58, Exploit: 18, Orchestrator: 48 },
    { time: '10:00', Recon: 65, OSINT: 65, Exploit: 30, Orchestrator: 58 },
    { time: '12:00', Recon: 45, OSINT: 60, Exploit: 45, Orchestrator: 68 },
    { time: '14:00', Recon: 30, OSINT: 68, Exploit: 58, Orchestrator: 78 },
    { time: '16:00', Recon: 20, OSINT: 55, Exploit: 70, Orchestrator: 85 },
    { time: '18:00', Recon: 15, OSINT: 45, Exploit: 80, Orchestrator: 90 },
    { time: '20:00', Recon: 10, OSINT: 35, Exploit: 88, Orchestrator: 94 },
    { time: '22:00', Recon: 6, OSINT: 25, Exploit: 92, Orchestrator: 96 },
    { time: '24:00', Recon: 4, OSINT: 18, Exploit: 95, Orchestrator: 98 },
  ],
  5: [
    { time: '00:00', Recon: 12, OSINT: 4, Exploit: 1, Orchestrator: 6 },
    { time: '02:00', Recon: 30, OSINT: 8, Exploit: 3, Orchestrator: 10 },
    { time: '04:00', Recon: 50, OSINT: 18, Exploit: 8, Orchestrator: 18 },
    { time: '06:00', Recon: 65, OSINT: 28, Exploit: 12, Orchestrator: 25 },
    { time: '08:00', Recon: 58, OSINT: 38, Exploit: 20, Orchestrator: 32 },
    { time: '10:00', Recon: 42, OSINT: 45, Exploit: 32, Orchestrator: 40 },
    { time: '12:00', Recon: 30, OSINT: 42, Exploit: 45, Orchestrator: 50 },
    { time: '14:00', Recon: 20, OSINT: 50, Exploit: 55, Orchestrator: 60 },
    { time: '16:00', Recon: 14, OSINT: 40, Exploit: 65, Orchestrator: 70 },
    { time: '18:00', Recon: 10, OSINT: 32, Exploit: 75, Orchestrator: 78 },
    { time: '20:00', Recon: 6, OSINT: 24, Exploit: 82, Orchestrator: 85 },
    { time: '22:00', Recon: 4, OSINT: 16, Exploit: 88, Orchestrator: 90 },
    { time: '24:00', Recon: 2, OSINT: 10, Exploit: 92, Orchestrator: 94 },
  ],
};

const SEVERITY_DATA: Record<number, { name: string; value: number; color: string }[]> = {
  1: [
    { name: 'Critical', value: 5, color: '#DC2626' },
    { name: 'High', value: 12, color: '#D97706' },
    { name: 'Medium', value: 20, color: '#2563EB' },
    { name: 'Low', value: 18, color: '#9CA3AF' },
  ],
  2: [
    { name: 'Critical', value: 3, color: '#DC2626' },
    { name: 'High', value: 8, color: '#D97706' },
    { name: 'Medium', value: 15, color: '#2563EB' },
    { name: 'Low', value: 24, color: '#9CA3AF' },
  ],
  3: [
    { name: 'Critical', value: 8, color: '#DC2626' },
    { name: 'High', value: 15, color: '#D97706' },
    { name: 'Medium', value: 18, color: '#2563EB' },
    { name: 'Low', value: 12, color: '#9CA3AF' },
  ],
  4: [
    { name: 'Critical', value: 6, color: '#DC2626' },
    { name: 'High', value: 18, color: '#D97706' },
    { name: 'Medium', value: 28, color: '#2563EB' },
    { name: 'Low', value: 15, color: '#9CA3AF' },
  ],
  5: [
    { name: 'Critical', value: 2, color: '#DC2626' },
    { name: 'High', value: 6, color: '#D97706' },
    { name: 'Medium', value: 12, color: '#2563EB' },
    { name: 'Low', value: 30, color: '#9CA3AF' },
  ],
};

const KILL_CHAIN_DATA = [
  { name: 'Assets Discovered', value: 847, color: '#9CA3AF', icon: Target },
  { name: 'Open Services', value: 256, color: '#3B82F6', icon: Shield },
  { name: 'Vulnerabilities', value: 41, color: '#D97706', icon: Zap },
  { name: 'Exploits', value: 12, color: '#DC2626', icon: Search },
  { name: 'Root Shells', value: 3, color: '#10B981', icon: Eye },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[var(--swarm-card)] border border-[var(--swarm-border)] p-3 rounded-lg shadow-lg">
        <p className="text-xs font-mono text-[var(--swarm-text-muted)] mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-[var(--swarm-text)]">{entry.name}: {entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const ReportsPanel = () => {
  const [selectedReport, setSelectedReport] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(".report-card", {
      y: 20, opacity: 0, duration: 0.5, stagger: 0.1, ease: "power2.out", clearProps: "all"
    });
  }, { scope: containerRef });

  const handleReportClick = (id: number) => {
    setSelectedReport(id);
    gsap.fromTo(`.report-row-${id}`, 
      { backgroundColor: "var(--swarm-accent)" },
      { backgroundColor: "transparent", duration: 0.5 }
    );
  };

  const agentActivityData = AGENT_ACTIVITY_BY_REPORT[selectedReport] || AGENT_ACTIVITY_BY_REPORT[1];
  const severityData = SEVERITY_DATA[selectedReport] || SEVERITY_DATA[1];

  return (
    <div ref={containerRef} className="space-y-4 flex flex-col h-full">
      <div className="flex items-center justify-between flex-shrink-0">
        <PanelHeader title="Analytics & Reports" subtitle="Swarm intelligence metrics and mission analytics" />
        <button className="flex items-center gap-2 px-4 py-2 bg-[var(--swarm-card)] text-[var(--swarm-text)] border border-[var(--swarm-border)] rounded-lg text-sm font-bold shadow-sm hover:bg-[var(--swarm-bg)] transition-colors">
           <Download size={16} /> Export PDF Report
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">
        <div className="report-card min-w-0 bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl p-5 xl:col-span-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-[var(--swarm-accent)]" />
            <h3 className="text-[15px] font-bold text-[var(--swarm-text)] tracking-tight">Swarm Agent Activity Timeline</h3>
          </div>
          <div className="flex items-center gap-4 mb-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-[#3B82F6]"></div>
              <span className="text-[var(--swarm-text-muted)]">Recon</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-[#10B981]"></div>
              <span className="text-[var(--swarm-text-muted)]">OSINT</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-[#DC2626]"></div>
              <span className="text-[var(--swarm-text-muted)]">Exploit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-[#D97706]"></div>
              <span className="text-[var(--swarm-text-muted)]">Orchestrator</span>
            </div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={agentActivityData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRecon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorOSINT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExploit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorOrch" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D97706" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--swarm-border)" />
                <XAxis 
                  dataKey="time" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--swarm-text-muted)', fontSize: 11, fontFamily: 'monospace' }} 
                  dy={10} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--swarm-text-muted)', fontSize: 11, fontFamily: 'monospace' }} 
                />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Recon" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorRecon)" stackId="1" isAnimationActive={true} animationDuration={1500} />
                <Area type="monotone" dataKey="OSINT" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorOSINT)" stackId="1" isAnimationActive={true} animationDuration={1500} />
                <Area type="monotone" dataKey="Exploit" stroke="#DC2626" strokeWidth={2} fillOpacity={1} fill="url(#colorExploit)" stackId="1" isAnimationActive={true} animationDuration={1500} />
                <Area type="monotone" dataKey="Orchestrator" stroke="#D97706" strokeWidth={2} fillOpacity={1} fill="url(#colorOrch)" stackId="1" isAnimationActive={true} animationDuration={1500} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="report-card min-w-0 bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl p-5 xl:col-span-5">
          <div className="flex items-center gap-2 mb-4">
            <Target size={18} className="text-[var(--swarm-accent)]" />
            <h3 className="text-[15px] font-bold text-[var(--swarm-text)] tracking-tight">Severity Distribution</h3>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData} layout="vertical" margin={{ top: 10, right: 30, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--swarm-border)" />
                <XAxis 
                  type="number" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--swarm-text-muted)', fontSize: 11, fontFamily: 'monospace' }} 
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--swarm-text)', fontSize: 11, fontFamily: 'monospace', fontWeight: 500 }} 
                  width={55}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" barSize={24} radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={1500} animationBegin={400} animationEasing="ease-out">
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--swarm-border)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--swarm-text-muted)]">Total Vulnerabilities</span>
              <span className="text-[var(--swarm-text)] font-bold">{severityData.reduce((a, b) => a + b.value, 0)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--swarm-card)] rounded-xl overflow-hidden flex-1 flex flex-col border border-[var(--swarm-border)]">
        <div className="px-5 py-3 border-b border-[var(--swarm-border)] flex items-center gap-2 bg-[var(--swarm-bg)]">
           <FileText size={16} className="text-[var(--swarm-accent)]" />
           <h3 className="text-sm font-bold text-[var(--swarm-text)]">Generated Reports Archive</h3>
        </div>
        <div className="overflow-x-auto flex-1">
           <table className="w-full text-left border-collapse">
             <thead className="bg-[var(--swarm-bg)]">
               <tr className="text-xs font-mono font-medium text-[var(--swarm-text-muted)] uppercase">
                 <th className="px-5 py-3">Report Name</th>
                 <th className="px-5 py-3">Generated By</th>
                 <th className="px-5 py-3">Date</th>
                 <th className="px-5 py-3">Size</th>
                 <th className="px-5 py-3 text-right">Download</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-[var(--swarm-border)]">
               {REPORTS.map((item, i) => (
<tr 
                   key={item.id} 
                   onClick={() => handleReportClick(item.id)}
                   className={`hover:bg-[var(--swarm-bg)] transition-colors cursor-pointer group report-row-${item.id} border-b border-[var(--swarm-border)] ${selectedReport === item.id ? 'bg-[var(--swarm-accent)]/10' : 'bg-[var(--swarm-card)]'}`}
                  >
                   <td className="px-5 py-3">
                     <div className="text-sm font-bold text-[var(--swarm-text)] group-hover:text-[var(--swarm-accent)] transition-colors">{item.name}</div>
                     <div className="text-xs font-mono text-[var(--swarm-text-muted)]">{item.type}</div>
                   </td>
                   <td className="px-5 py-3 text-sm font-mono text-[var(--swarm-text-muted)]">{item.by}</td>
                   <td className="px-5 py-3 text-sm font-mono text-[var(--swarm-text-muted)]">{item.date}</td>
                   <td className="px-5 py-3 text-sm font-mono text-[var(--swarm-text-muted)]">{item.size}</td>
                   <td className="px-5 py-3 text-right">
                     <button className="p-2 text-[var(--swarm-text-muted)] hover:text-[var(--swarm-accent)] hover:bg-[var(--swarm-accent)]/10 rounded-lg transition-colors">
                       <Download size={16} />
                     </button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
        </div>
      </div>
    </div>
  );
};