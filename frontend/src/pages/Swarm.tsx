import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Terminal,
  Zap,
  Search,
  Plus,
  Target,
  PanelLeftClose,
  PanelLeft,
  FileText,
  Activity,
  Command,
  Monitor,
  Lock,
  Eye,
  ShieldAlert,
  History,
  Copy,
  Check,
  Send,
  X,
  ChevronRight,
  Globe,
  Server,
  Cpu,
  Database,
  AlertTriangle,
  Sun,
  CircleDot,
  Play,
  User,
  LayoutGrid
} from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useSwarmStore } from '../store/swarm';

import { OverviewPanel } from '../components/OverviewPanel';
import { AgentsPanel } from '../components/AgentsPanel';
import { FindingsPanel } from '../components/FindingsPanel';
import { CommandsPanel } from '../components/CommandsPanel';
import { ExploitsPanel } from '../components/ExploitsPanel';
import { SecretsPanel } from '../components/SecretsPanel';
import { ReportsPanel } from '../components/ReportsPanel';
import { FindingDrawer } from '../components/FindingDrawer';
import { CommandPalette } from '../components/CommandPalette';
import { NotificationCenter } from '../components/NotificationCenter';

gsap.registerPlugin(useGSAP);

const NavItem: React.FC<{
  icon: React.ReactElement;
  label: string;
  isCollapsed: boolean;
  isActive?: boolean;
  onClick?: () => void;
  badge?: string;
  badgeColor?: string;
}> = ({ icon, label, isCollapsed, isActive, onClick, badge, badgeColor = 'bg-[var(--swarm-sidebar-accent)]' }) => (
  <div 
    onClick={onClick}
    title={isCollapsed ? label : ''}
    className={`
      flex items-center px-4 py-3 rounded-xl cursor-pointer transition-all border group
      ${isCollapsed ? 'justify-center px-0' : 'gap-3'}
      ${isActive 
        ? 'bg-white/10 text-white border-white/5 shadow-inner' 
        : 'text-white/40 border-transparent hover:bg-white/5 hover:text-white/80 active:scale-95'}
    `}
  >
    <div className={`flex-shrink-0 transition-transform ${isActive ? 'scale-110' : 'opacity-60 group-hover:opacity-100'}`}>
      {React.cloneElement(icon as React.ReactElement<any>, { size: 18, strokeWidth: isActive ? 2.5 : 2 })}
    </div>
    {!isCollapsed && (
      <span className="sidebar-text text-[13px] font-medium tracking-tight whitespace-nowrap overflow-hidden">
        {label}
      </span>
    )}
    {badge && !isCollapsed && (
      <span className={`sidebar-text ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded-md ${badgeColor} text-white/95 uppercase tracking-wider`}>
        {badge}
      </span>
    )}
  </div>
);

const SwarmDashboard: React.FC = () => {
  const { activeView, setActiveView, findings, theme } = useSwarmStore();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const themeColors = {
    light: { bg: '#F6F2EC', text: '#1A1714', card: '#FFFFFF', border: 'rgba(26,23,20,0.1)', muted: '#6B6560' },
    charcoal: { bg: '#1a1a1a', text: '#e5e5e5', card: '#262626', border: '#333333', muted: '#888888' },
    black: { bg: '#000000', text: '#ffffff', card: '#111111', border: '#27272a', muted: '#a1a1aa' },
  };
  const colors = themeColors[theme];
  const sidebarRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.to(sidebarRef.current, { width: isCollapsed ? 76 : 240, duration: 0.4, ease: 'power3.inOut' });
    const textEls = sidebarRef.current?.querySelectorAll('.sidebar-text');
    if (textEls) gsap.to(textEls, { opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto', duration: 0.3, ease: 'power2.inOut' });
  }, { dependencies: [isCollapsed], scope: sidebarRef });

  useGSAP(() => {
    gsap.fromTo(canvasRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
    const widgets = canvasRef.current?.querySelectorAll('.dash-widget');
    if (widgets) gsap.fromTo(widgets, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.05, ease: 'back.out(1.4)', delay: 0.1 });
  }, { dependencies: [activeView], scope: canvasRef });

  const renderContent = () => {
    switch (activeView) {
      case 'overview': return <OverviewPanel />;
      case 'agents': return <AgentsPanel />;
      case 'findings': return <FindingsPanel />;
      case 'commands': return <CommandsPanel />;
      case 'exploits': return <ExploitsPanel />;
      case 'secrets': return <SecretsPanel />;
      case 'reports': return <ReportsPanel />;
      default: return <OverviewPanel />;
    }
  };

  const handleAgentClick = (agentId: string) => {
    setSelectedAgent(agentId);
    setActiveView('agents');
  };

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      <CommandPalette />
      <FindingDrawer />
      
      <aside ref={sidebarRef} className={`relative flex flex-col bg-[#15120F] border-r border-white/5 h-screen transition-all duration-300 ease-in-out shrink-0 ${isCollapsed ? 'w-[72px]' : 'w-64'}`}>
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="absolute -right-4 top-20 w-8 h-8 rounded-full bg-[#211E1A] border border-white/10 flex items-center justify-center text-[#A8A19A] hover:text-[var(--swarm-sidebar-accent)] z-50 shadow-xl group transition-all">
          {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
        
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <Sun size={20} className="text-[var(--swarm-sidebar-accent)] shrink-0" />
            <span className={`font-bold text-gray-200 whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>
              Solaris Agent
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-6 [&::-webkit-scrollbar]:hidden">
          <div className={`bg-[#1A1714]/80 border border-white/5 rounded-xl transition-all duration-300 overflow-hidden ${isCollapsed ? 'p-2' : 'p-3'}`}>
            <div className="flex items-center justify-center h-4 w-4 mx-auto mb-1 opacity-0 hidden md:block">
              {isCollapsed && <span className="w-2 h-2 rounded-full bg-[var(--swarm-sidebar-accent)] animate-pulse mx-auto"></span>}
            </div>
            <div className={`transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100 block'}`}>
              <h4 className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-1 drop-shadow-sm">
                Active Mission
              </h4>
              <div className="font-bold text-gray-200 text-sm truncate mb-1">
                acme-corp-ext-2026
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[var(--swarm-sidebar-accent)] uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--swarm-sidebar-accent)] animate-pulse drop-shadow-[0_0_5px_rgba(214,154,124,0.6)]"></span>
                Mission Running
              </div>
            </div>
          </div>

          <div>
            {!isCollapsed && (
              <h4 className="text-[10px] font-mono tracking-widest text-gray-500 uppercase mb-2 px-2">Navigation</h4>
            )}
            <nav className="space-y-0.5">
              <button
                onClick={() => { setActiveView('overview'); setSelectedAgent(null); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group relative ${
                  activeView === 'overview' ? 'bg-[var(--swarm-sidebar-accent)]/10 text-[var(--swarm-sidebar-accent)]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
                title={isCollapsed ? 'Overview' : undefined}
              >
                <div className="flex items-center gap-3">
                  <LayoutDashboard size={18} className="shrink-0" />
                  <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100 block'}`}>
                    Overview
                  </span>
                </div>
              </button>

              <button
                onClick={() => setActiveView('agents')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group relative ${
                  activeView === 'agents' ? 'bg-[var(--swarm-sidebar-accent)]/10 text-[var(--swarm-sidebar-accent)]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
                title={isCollapsed ? 'Agents' : undefined}
              >
                <div className="flex items-center gap-3">
                  <User size={18} className="shrink-0" />
                  <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100 block'}`}>
                    Agents
                  </span>
                </div>
                {!isCollapsed && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border border-current/10 bg-amber-500/10 text-amber-500">
                    4
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveView('findings')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group relative ${
                  activeView === 'findings' ? 'bg-[var(--swarm-sidebar-accent)]/10 text-[var(--swarm-sidebar-accent)]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
                title={isCollapsed ? 'Findings' : undefined}
              >
                <div className="flex items-center gap-3">
                  <ShieldAlert size={18} className="shrink-0" />
                  <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100 block'}`}>
                    Findings
                  </span>
                </div>
                {!isCollapsed && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border border-current/10 bg-red-500/10 text-red-500">
                    {findings.filter(f => f.status === 'Open').length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveView('commands')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group relative ${
                  activeView === 'commands' ? 'bg-[var(--swarm-sidebar-accent)]/10 text-[var(--swarm-sidebar-accent)]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
                title={isCollapsed ? 'Commands' : undefined}
              >
                <div className="flex items-center gap-3">
                  <Terminal size={18} className="shrink-0" />
                  <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100 block'}`}>
                    Commands
                  </span>
                </div>
              </button>

              <button
                onClick={() => setActiveView('exploits')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group relative ${
                  activeView === 'exploits' ? 'bg-[var(--swarm-sidebar-accent)]/10 text-[var(--swarm-sidebar-accent)]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
                title={isCollapsed ? 'Exploits' : undefined}
              >
                <div className="flex items-center gap-3">
                  <Zap size={18} className="shrink-0" />
                  <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100 block'}`}>
                    Exploits
                  </span>
                </div>
              </button>

              <button
                onClick={() => setActiveView('secrets')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group relative ${
                  activeView === 'secrets' ? 'bg-[var(--swarm-sidebar-accent)]/10 text-[var(--swarm-sidebar-accent)]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
                title={isCollapsed ? 'Secrets' : undefined}
              >
                <div className="flex items-center gap-3">
                  <Lock size={18} className="shrink-0" />
                  <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100 block'}`}>
                    Secrets & Creds
                  </span>
                </div>
              </button>

              <button
                onClick={() => setActiveView('reports')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group relative ${
                  activeView === 'reports' ? 'bg-[var(--swarm-sidebar-accent)]/10 text-[var(--swarm-sidebar-accent)]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
                title={isCollapsed ? 'Reports' : undefined}
              >
                <div className="flex items-center gap-3">
                  <FileText size={18} className="shrink-0" strokeWidth={1.5} />
                  <span className={`text-[13px] font-medium whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100 block'}`}>
                    Reports
                  </span>
                </div>
              </button>
            </nav>
          </div>
        </div>

        <div className={`p-3 border-t border-white/5 space-y-2 transition-all duration-300 ${isCollapsed ? 'items-center flex flex-col' : ''}`}>
          <button className={`flex items-center justify-center gap-2 font-mono font-bold text-[12px] border border-[var(--swarm-sidebar-accent)]/20 text-[var(--swarm-sidebar-accent)] bg-[var(--swarm-sidebar-accent)]/5 hover:bg-[var(--swarm-sidebar-accent)]/10 rounded-lg transition-colors ${
            isCollapsed ? 'w-10 h-10 p-0' : 'w-full py-2.5 px-4'
          }`}>
            <Play size={14} className="shrink-0 fill-current" />
            {!isCollapsed && <span>New Mission</span>}
          </button>
          <button className={`flex items-center justify-center gap-2 font-mono font-bold text-[12px] bg-transparent border border-white/10 hover:bg-white/5 text-gray-400 rounded-lg transition-colors ${
            isCollapsed ? 'w-10 h-10 p-0' : 'w-full py-2.5 px-4'
          }`}>
            <LayoutGrid size={14} className="shrink-0" />
            {!isCollapsed && <span>All Missions</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-[60px] border-b flex items-center justify-between px-8 flex-shrink-0 z-10 bg-[var(--swarm-canvas)] border-[var(--swarm-border)]">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight capitalize text-[var(--swarm-text)]">
              {activeView === 'findings' ? 'Findings' : activeView === 'commands' ? 'Commands & Exploits' : activeView === 'secrets' ? 'Secrets & Credentials' : activeView === 'reports' ? 'Reports' : activeView === 'agents' ? 'Swarm Agents' : activeView === 'overview' ? 'Overview' : activeView}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-4 py-2 rounded-full text-[10px] bg-[var(--swarm-card)] border border-[var(--swarm-border)] text-[var(--swarm-text-muted)]">
              <span className="font-semibold text-[var(--swarm-text)]">acme.corp</span>
              <span className="opacity-20">|</span>
              <span>192.168.0.0/24</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-[var(--swarm-sidebar-accent)]/5 border border-[var(--swarm-sidebar-accent)]/20 rounded-full text-[10px] text-[var(--swarm-sidebar-accent)] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--swarm-sidebar-accent)] animate-pulse" /> RUNNING
            </div>
            <NotificationCenter />
            <div className="text-xs font-medium ml-2" style={{ color: colors.muted }}>00:15:22</div>
          </div>
        </header>
        <div ref={canvasRef} className="flex-1 overflow-y-auto p-10 max-w-[1700px] mx-auto w-full bg-[var(--swarm-bg)]">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default SwarmDashboard;