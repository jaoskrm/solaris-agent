import React, { useEffect } from 'react';
import { Bell, CheckCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useSwarmStore } from '../store/swarm';
import { gsap } from 'gsap';

export const NotificationCenter: React.FC = () => {
  const { notifications, markNotificationRead } = useSwarmStore();
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    notifications.forEach(n => {
      if (!n.read) {
        const timer = setTimeout(() => {
           handleClose(n.id);
        }, 5000);
        return () => clearTimeout(timer);
      }
    });
  }, [notifications]);

  const handleClose = (id: string) => {
    gsap.to(`.notif-${id}`, { scale: 0.8, opacity: 0, duration: 0.3, onComplete: () => markNotificationRead(id) });
  };

  useEffect(() => {
    notifications.filter(n => !n.read).forEach((n) => {
      const el = document.querySelector(`.notif-${n.id}`);
      if (el && !el.hasAttribute('data-in')) {
        el.setAttribute('data-in', 'true');
        gsap.fromTo(el, { x: 400, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "power3.out" });
      }
    });
  }, [notifications]);

  return (
    <>
      <div className="relative">
        <button 
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/20 transition-colors relative"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border border-[#15120F]" />
          )}
        </button>
      </div>

      <div className="fixed top-20 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
        {notifications.filter(n => !n.read).map(n => (
          <div 
            key={n.id} 
            className={`notif-${n.id} pointer-events-auto w-[340px] bg-white rounded-xl shadow-xl border border-[#1A1714]/10 p-4 flex gap-3`}
          >
             <div className="shrink-0 mt-0.5">
               {n.type === 'alert' && <AlertTriangle size={18} className="text-red-500" />}
               {n.type === 'success' && <CheckCircle size={18} className="text-emerald-500" />}
               {n.type === 'info' && <Info size={18} className="text-blue-500" />}
             </div>
             <div className="flex-1">
               <div className="text-sm font-bold text-[#1A1714]">{n.title}</div>
               <div className="text-xs text-[#6B6560] mt-1 pr-2">{n.msg}</div>
             </div>
             <button onClick={() => handleClose(n.id)} className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors h-fit">
                <X size={16} />
             </button>
          </div>
        ))}
      </div>
    </>
  );
};