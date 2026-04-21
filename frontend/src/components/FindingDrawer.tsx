import React, { useEffect, useRef } from 'react';
import { useSwarmStore } from '../store/swarm';
import { X, ShieldAlert, Crosshair, Terminal, Clock, Activity, Target } from 'lucide-react';
import { gsap } from 'gsap';

export const FindingDrawer: React.FC = () => {
  const { selectedFindingId, setSelectedFindingId, findings, runExploit } = useSwarmStore();
  const drawerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const finding = findings.find(f => f.id === selectedFindingId);

  useEffect(() => {
    if (selectedFindingId && finding) {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      gsap.fromTo(drawerRef.current, { x: '100%' }, { x: '0%', duration: 0.4, ease: 'power3.out' });
      
      if (drawerRef.current) {
        gsap.fromTo(drawerRef.current.querySelectorAll('.stagger-item'), 
          { y: 20, opacity: 0 }, 
          { y: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: "power2.out", delay: 0.1 }
        );
      }
    }
  }, [selectedFindingId, finding]);

  const closeDrawer = () => {
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.3 });
    gsap.to(drawerRef.current, { x: '100%', duration: 0.4, ease: 'power3.in', onComplete: () => setSelectedFindingId(null) });
  };

  const handleExploit = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    gsap.fromTo(e.currentTarget, { scale: 0.95 }, { scale: 1, duration: 0.2 });
    runExploit(id);
    
    for(let i=0; i<40; i++) {
       const drop = document.createElement('div');
       drop.style.position = 'fixed';
       drop.style.top = e.clientY + 'px';
       drop.style.left = e.clientX + 'px';
       drop.style.width = '8px';
       drop.style.height = '8px';
       drop.style.backgroundColor = ['#EF4444', '#10B981', '#F59E0B', '#3B82F6'][Math.floor(Math.random()*4)];
       drop.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
       drop.style.zIndex = '9999';
       document.body.appendChild(drop);
       gsap.to(drop, {
          x: (Math.random() - 0.5) * 400,
          y: (Math.random() - 0.5) * 400 + 100,
          rotation: Math.random() * 360,
          opacity: 0,
          duration: 1 + Math.random(),
          ease: "power3.out",
          onComplete: () => drop.remove()
       });
    }
  };

  if (!selectedFindingId || !finding) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div ref={overlayRef} className="absolute inset-0 bg-[#1A1714]/40 backdrop-blur-sm" onClick={closeDrawer} />
      
      <div ref={drawerRef} className="relative w-full max-w-xl h-full bg-[#F6F2EC] shadow-2xl flex flex-col border-l border-[#1A1714]/10">
        <div className="px-6 py-4 flex items-center justify-between border-b border-[#1A1714]/10 bg-white">
           <div className="flex items-center gap-3">
             <ShieldAlert className={finding.sev === 'Critical' ? 'text-red-500' : 'text-amber-500'} size={20} />
             <div>
               <div className="font-mono text-xs font-bold text-[#A8A19A] tracking-wider">{finding.id}</div>
               <h2 className="text-lg font-bold text-[#1A1714]">{finding.title}</h2>
             </div>
           </div>
           <button onClick={closeDrawer} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
              <X size={18} />
           </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
           <div className="grid grid-cols-2 gap-4 stagger-item">
             <div className="bg-white p-4 rounded-xl shadow-sm border border-[#1A1714]/5 space-y-1">
               <div className="text-xs font-bold text-[#6B6560] tracking-wide">Severity</div>
               <div className={`font-bold text-sm ${finding.sev === 'Critical' ? 'text-red-500' : 'text-amber-500'}`}>{finding.sev} ({finding.cvss})</div>
             </div>
             <div className="bg-white p-4 rounded-xl shadow-sm border border-[#1A1714]/5 space-y-1">
               <div className="text-xs font-bold text-[#6B6560] tracking-wide">Status</div>
               <div className={`font-bold text-sm ${finding.status === 'Fixed' ? 'text-emerald-500' : 'text-amber-500'}`}>{finding.status}</div>
             </div>
             <div className="bg-white p-4 rounded-xl shadow-sm border border-[#1A1714]/5 space-y-1">
               <div className="text-xs font-bold text-[#6B6560] tracking-wide">Target Vector</div>
               <div className="font-mono text-sm text-[#1A1714]">{finding.loc}</div>
             </div>
             <div className="bg-white p-4 rounded-xl shadow-sm border border-[#1A1714]/5 space-y-1">
               <div className="text-xs font-bold text-[#6B6560] tracking-wide">Reporting Agent</div>
               <div className="font-bold text-sm text-[#1A1714]">{finding.agent}</div>
             </div>
           </div>

           <div className="bg-white p-6 rounded-xl shadow-sm border border-[#1A1714]/5 stagger-item">
             <h3 className="text-sm font-bold text-[#1A1714] mb-3 flex items-center gap-2"><Target size={16} className="text-[#6B6560]" /> Vulnerability Description</h3>
             <p className="text-sm text-[#6B6560] leading-relaxed">{finding.desc}</p>
           </div>

           <div className="bg-white p-6 rounded-xl shadow-sm border border-[#1A1714]/5 stagger-item">
             <h3 className="text-sm font-bold text-[#1A1714] mb-4 flex items-center gap-2"><Clock size={16} className="text-[#6B6560]"/> Event Timeline</h3>
             <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[11px] before:w-px before:bg-[#E5E0D8]">
                <div className="relative flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-emerald-500 flex items-center justify-center shrink-0 z-10">
                    <Activity size={12} className="text-emerald-500" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#A8A19A] tracking-wide">{finding.timestamp || '2026-04-17 14:00:00'}</div>
                    <div className="text-sm font-bold text-[#1A1714]">Discovery</div>
                    <div className="text-xs text-[#6B6560] mt-1">Identified via automated surface mapping.</div>
                  </div>
                </div>
                <div className="relative flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-[#1A1714] border-2 border-[#1A1714] flex items-center justify-center shrink-0 z-10">
                    <Terminal size={12} className="text-white" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#A8A19A] tracking-wide">{finding.timestamp || '2026-04-17 14:05:00'}</div>
                    <div className="text-sm font-bold text-[#1A1714]">Validation</div>
                    <div className="text-xs text-[#6B6560] mt-1">Confirmed exploitability using non-destructive payload.</div>
                  </div>
                </div>
             </div>
           </div>

           <div className="bg-[#15120F] p-6 rounded-xl shadow-sm stagger-item">
             <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Terminal size={16} className="text-[#6B6560]" /> Request Trace Sample</h3>
             <div className="bg-black/50 p-4 rounded-md overflow-x-auto">
               <pre className="text-xs font-mono tracking-wide leading-relaxed text-gray-300">
                 GET /manager/html HTTP/1.1<br/>
                 Host: {finding.loc.split(':')[0]}<br/>
                 Authorization: Basic dG9tY2F0OnRvbWNhdA==<br/>
                 User-Agent: SwarmOps/2.4<br/>
                 Accept: */*<br/>
               </pre>
             </div>
           </div>
        </div>

        <div className="p-6 border-t border-[#1A1714]/10 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] stagger-item">
           <button 
             onClick={(e) => handleExploit(e, finding.id)}
             className="w-full flex items-center justify-center gap-2 py-3 bg-[#1A1714] hover:bg-black text-white rounded-lg text-sm font-bold transition-colors">
              <Crosshair size={16} /> Deploy Weaponized Payload
           </button>
        </div>
      </div>
    </div>
  );
};