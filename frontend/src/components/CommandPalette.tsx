import React, { useEffect, useRef, useState } from 'react';
import { useSwarmStore } from '../store/swarm';
import { Search, Terminal, ShieldAlert, Lock, Activity } from 'lucide-react';
import { gsap } from 'gsap';

export const CommandPalette: React.FC = () => {
  const { isCommandPaletteOpen, setCommandPaletteOpen, findings, agents, secrets } = useSwarmStore();
  const [query, setQuery] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (e.key === '/' && !isCommandPaletteOpen && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (e.key === 'Escape' && isCommandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(paletteRef.current, { scale: 0.95, opacity: 0, y: -20 }, { scale: 1, opacity: 1, y: 0, duration: 0.2, ease: 'out' });
      setQuery('');
      setTimeout(() => {
        const input = paletteRef.current?.querySelector('input');
        input?.focus();
      }, 50);
    }
  }, [isCommandPaletteOpen]);

  const closePalette = () => {
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2 });
    gsap.to(paletteRef.current, { scale: 0.95, opacity: 0, y: -20, duration: 0.2, onComplete: () => setCommandPaletteOpen(false) });
  };

  if (!isCommandPaletteOpen) return null;

  const filteredFindings = findings.filter(f => f.title.toLowerCase().includes(query.toLowerCase()) || f.id.toLowerCase().includes(query.toLowerCase())).slice(0, 3);
  const filteredAgents = agents.filter(a => a.name.toLowerCase().includes(query.toLowerCase())).slice(0, 2);
  const filteredSecrets = secrets.filter(s => s.key.toLowerCase().includes(query.toLowerCase())).slice(0, 2);

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[100] flex items-start justify-center pt-32 bg-[#1A1714]/60 backdrop-blur-sm" onClick={closePalette}>
      <div 
        ref={paletteRef} 
        className="w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden border border-[#1A1714]/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 border-b border-[#1A1714]/10">
          <Search size={20} className="text-[#6B6560]" />
          <input 
            type="text" 
            placeholder="Search findings, agents, commands... (Esc to close)" 
            className="w-full bg-transparent border-none outline-none px-4 py-5 text-[#1A1714] text-sm font-sans placeholder-[#A8A19A]"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-hide">
          {query.trim() === '' ? (
            <div className="p-8 text-center text-sm font-medium text-[#6B6560]">
               Type to search across the entire SwarmOps platform.
            </div>
          ) : (
            <div className="space-y-4 p-2">
              {filteredFindings.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono font-bold text-[#A8A19A] px-3 mb-2 uppercase tracking-wide">Findings</div>
                  {filteredFindings.map(f => (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2 hover:bg-[#F6F2EC] rounded-lg cursor-pointer transition-colors">
                      <ShieldAlert size={16} className={f.sev === 'Critical' ? 'text-red-500' : 'text-amber-500'} />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-[#1A1714]">{f.title}</div>
                        <div className="text-xs font-mono text-[#6B6560]">{f.id} • {f.agent}</div>
                      </div>
                      <div className="text-xs font-mono font-bold text-[#A8A19A]">View Details ↵</div>
                    </div>
                  ))}
                </div>
              )}

              {filteredAgents.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono font-bold text-[#A8A19A] px-3 mb-2 uppercase tracking-wide">Agents</div>
                  {filteredAgents.map(a => (
                    <div key={a.id} className="flex items-center gap-3 px-3 py-2 hover:bg-[#F6F2EC] rounded-lg cursor-pointer transition-colors">
                      <Activity size={16} className={a.color} />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-[#1A1714]">{a.name}</div>
                        <div className="text-xs font-mono text-[#6B6560]">{a.status} • {a.prog}%</div>
                      </div>
                      <div className="text-xs font-mono font-bold text-[#A8A19A]">Open Console ↵</div>
                    </div>
                  ))}
                </div>
              )}

              {filteredSecrets.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono font-bold text-[#A8A19A] px-3 mb-2 uppercase tracking-wide">Secrets</div>
                  {filteredSecrets.map(s => (
                    <div key={s.key} className="flex items-center gap-3 px-3 py-2 hover:bg-[#F6F2EC] rounded-lg cursor-pointer transition-colors">
                      <Lock size={16} className="text-[#6B6560]" />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-[#1A1714]">{s.key}</div>
                        <div className="text-xs font-mono text-[#6B6560]">{s.type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};