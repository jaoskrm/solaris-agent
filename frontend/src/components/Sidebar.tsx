import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Menu, LayoutDashboard, Users, ShieldAlert, 
  Terminal, Zap, Radar, FileText, Settings, Plus 
} from 'lucide-react';

const mainLinks = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, active: true },
  { id: 'agents', label: 'Agents', icon: Users, badge: '4' },
  { id: 'findings', label: 'Findings', icon: ShieldAlert, badge: '24', badgeColor: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { id: 'commands', label: 'Commands', icon: Terminal },
  { id: 'exploits', label: 'Exploits', icon: Zap, badge: '3', badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { id: 'recon', label: 'Recon', icon: Radar },
];

const bottomLinks = [
  { id: 'report', label: 'Report', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  onNavigate?: (id: string) => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 72 : 240 }}
      className="h-screen bg-[#15120F] border-r border-white/5 flex flex-col shrink-0 overflow-hidden relative z-50"
    >
      {/* Header / Logo Area */}
      <div className="h-[60px] flex items-center px-4 border-b border-white/5 shrink-0 gap-3">
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        
        <AnimatePresence mode="popLayout">
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 overflow-hidden whitespace-nowrap"
            >
              <div className="w-6 h-6 rounded bg-[#C06010]/20 flex items-center justify-center border border-[#C06010]/30">
                <Zap className="w-3.5 h-3.5 text-[#C06010]" />
              </div>
              <span className="font-semibold text-white/90 text-sm tracking-wide">
                Solaris Agent
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col p-3 no-scrollbar">
        {/* Active Mission Block */}
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 bg-white/[0.03] border border-white/[0.05] rounded-lg p-3 overflow-hidden"
            >
              <div className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-1">Active Mission</div>
              <div className="text-xs font-semibold text-white/90 mb-2 truncate">acme-corp-ext-2026</div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-[#C06010] uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-[#C06010] animate-pulse" />
                Mission running
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Links */}
        <div className="flex flex-col gap-1">
          {mainLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.id}
                onClick={() => onNavigate?.(link.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap ${
                  link.active 
                    ? 'bg-white/10 text-white border border-white/10' 
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${link.active ? 'text-[#C06010]' : ''}`} />
                
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-between flex-1 overflow-hidden"
                    >
                      <span>{link.label}</span>
                      {link.badge && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${link.badgeColor || 'bg-[#C06010]/20 text-[#C06010] border-[#C06010]/30'}`}>
                          {link.badge}
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>

        {/* Bottom Links */}
        <div className="mt-auto pt-6 flex flex-col gap-1">
          {bottomLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.id}
                onClick={() => onNavigate?.(link.id)}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/30 hover:text-white/50 transition-colors whitespace-nowrap"
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!isCollapsed && <span className="transition-opacity duration-200">{link.label}</span>}
              </button>
            );
          })}
          
          <button className={`mt-4 flex items-center justify-center gap-2 bg-[#C06010] hover:bg-[#E07820] text-[#15120F] font-semibold rounded-md py-2 transition-colors ${isCollapsed ? 'px-0' : 'px-4'}`}>
            <Plus className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span className="text-sm">New Mission</span>}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}