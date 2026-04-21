import React, { useRef, useLayoutEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { gsap } from 'gsap';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PanelHeader: React.FC<{ title: string; subtitle?: string; badge?: string; badgeColor?: string }> = ({ title, subtitle, badge, badgeColor = 'bg-amber-600' }) => (
  <div className="flex items-center justify-between mb-8">
    <div>
      <h2 className="text-3xl font-serif font-bold text-[#1A1714] tracking-tight">{title}</h2>
      {subtitle && <p className="text-xs font-mono text-[#6B6560] mt-1">{subtitle}</p>}
    </div>
    {badge && (
      <span className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold text-white ${badgeColor} uppercase tracking-wide`}>
        {badge}
      </span>
    )}
  </div>
);

export const StatCard: React.FC<{ value: string; label: string; delta?: string; deltaColor?: string; plus?: boolean; fraction?: string; chartData?: any[] }> = ({ value, label, delta, deltaColor = 'text-red-500', plus, fraction, chartData }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (valueRef.current) {
      gsap.fromTo(valueRef.current, { scale: 1.1, color: '#D97706' }, { scale: 1, color: '#1A1714', duration: 0.4, ease: 'power2.out' });
    }
  }, [value]);

  return (
    <div ref={cardRef} className="dash-widget bg-[var(--swarm-card)] border border-[var(--swarm-border)] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
      {chartData && (
        <div className="absolute inset-0 top-10 opacity-[0.03] pointer-events-none stroke-current" style={{ color: deltaColor.includes('red') ? '#dc2626' : deltaColor.includes('emerald') ? '#10b981' : '#1A1714' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line type="monotone" dataKey="value" stroke="currentColor" strokeWidth={6} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-baseline gap-1 mb-2 font-serif text-[#1A1714]">
          <span ref={valueRef} className="text-4xl leading-none font-bold tracking-tight">{value}</span>
          {plus && <span className="text-2xl font-medium opacity-80">+</span>}
          {fraction && <span className="text-2xl font-medium opacity-40">{fraction}</span>}
        </div>
        <div className="text-xs font-mono font-medium text-[#6B6560] mb-4">{label}</div>
        <div className="mt-auto pt-4 border-t border-[#1A1714]/[0.05]">
          {delta ? (
            <div className={`text-[11px] font-mono font-medium ${deltaColor} flex items-center gap-1.5`}>
              <span className="opacity-40">❯</span> {delta}
            </div>
          ) : (
            <div className="text-[11px] font-mono font-medium text-transparent leading-none select-none">-</div>
          )}
        </div>
      </div>
    </div>
  );
};

export const Tooltip: React.FC<{ content: React.ReactNode; children: React.ReactNode }> = ({ content, children }) => {
  const [show, setShow] = useState(false);
  return (
    <div 
      className="relative flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute bottom-full mb-2 bg-[#1A1714] text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap">
          {content}
        </div>
      )}
    </div>
  );
};

export const EmptyState: React.FC<{ message: string; subMessage?: string; icon?: React.ReactNode }> = ({ message, subMessage, icon }) => (
  <div className="flex flex-col items-center justify-center p-12 text-[#A8A19A] h-full w-full">
    {icon && <div className="mb-4 opacity-50">{icon}</div>}
    <h3 className="font-serif text-xl font-medium text-[#1A1714] mb-2">{message}</h3>
    {subMessage && <p className="text-sm">{subMessage}</p>}
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("animate-pulse bg-[#1A1714]/10 rounded", className)} />
);