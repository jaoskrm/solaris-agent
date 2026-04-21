import React, { useRef } from 'react';
import { useSwarmStore } from '../store/swarm';
import { PanelHeader, EmptyState } from './Shared';
import { Eye, EyeOff, Copy, Lock, Clock, UserCheck, Key, Database, FileKey, Shield, Server, Terminal, Search, AlertTriangle, TrendingUp, Globe, GitBranch, FolderKey, Target, Wifi } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

const SECRET_TABLE_DATA = [
  { id: '01', type: 'AWS', name: 'AWS_ACCESS_KEY_ID', value: 'AKIAIOSFODNN7EXAMPLE', location: 'api.acme.corp metadata', source: 'GitHub Recon', agent: 'Recon', status: 'Valid' },
  { id: '02', type: 'AWS', name: 'AWS_SECRET_ACCESS_KEY', value: 'wJalrXUznFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', location: 'api.acme.corp metadata', source: 'GitHub Recon', agent: 'Recon', status: 'Valid' },
  { id: '03', type: 'DB', name: 'POSTGRES_PASSWORD', value: 'prod_db_p@ssw0rd_2024!', location: '192.168.0.5:5432', source: 'Exploit Agent', agent: 'Exploit', status: 'Exploited' },
  { id: '04', type: 'DB', name: 'MYSQL_ROOT', value: 'mysql_r00t_s3cr3t!', location: '.env file', source: 'Exploit Agent', agent: 'Exploit', status: 'Exploited' },
  { id: '05', type: 'JWT', name: 'JWT_ADMIN_TOKEN', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', location: '/auth/admin endpoint', source: 'Exploit Agent', agent: 'Exploit', status: 'Forged' },
  { id: '06', type: 'SSH', name: 'SSH_PRIVATE_KEY', value: '-----BEGIN RSA PRIVATE KEY-----', location: '/home/tomcat/.ssh/id_rsa', source: 'Post Exploit', agent: 'Exploit', status: 'Compromised' },
  { id: '07', type: 'API', name: 'STRIPE_API_KEY', value: 'sk_live_51MqLe8P2oV3xG4h5j6k...', location: 'GitHub repo config', source: 'GitHub Recon', agent: 'Recon', status: 'Active' },
  { id: '08', type: 'DB', name: 'MONGODB_URI', value: 'mongodb://admin:password123@db.acme.corp:27017', location: 'wiki.acme.corp', source: 'Exploit Agent', agent: 'Exploit', status: 'Exposed' },
];

const SOURCE_VECTORS = [
  { icon: Globe, label: 'api.acme.corp metadata', count: 4 },
  { icon: GitBranch, label: 'GitHub Deploy Scripts', count: 2 },
  { icon: FolderKey, label: '/home/tomcat/.ssh/', count: 1 },
  { icon: Database, label: '192.168.0.5:5432', count: 1 },
];

export const SecretsPanel: React.FC = () => {
  const { theme } = useSwarmStore();
  const [revealedMap, setRevealedMap] = React.useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = React.useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const toggleReveal = (id: string) => {
    setRevealedMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useGSAP(() => {
    gsap.from(".secret-card", {
      y: 20, opacity: 0, duration: 0.5, stagger: 0.1, ease: "power2.out"
    });
    gsap.from(".intel-panel", {
      x: -20, opacity: 0, duration: 0.4, stagger: 0.1, ease: "power2.out"
    });
  }, { scope: panelRef });

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>, val: string) => {
    navigator.clipboard.writeText(val);
    const btn = e.currentTarget;
    gsap.fromTo(btn, { scale: 0.8, color: '#10b981' }, { scale: 1, color: 'var(--swarm-accent)', duration: 0.5 });
  };

  const onHover = (e: React.MouseEvent<HTMLDivElement>, isEnter: boolean) => {
    gsap.to(e.currentTarget, {
      y: isEnter ? -4 : 0, 
      boxShadow: isEnter ? "0 12px 24px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.05)",
      duration: 0.3
    });
  };

  const counts = {
    AWS: SECRET_TABLE_DATA.filter(s => s.type === 'AWS').length,
    DB: SECRET_TABLE_DATA.filter(s => s.type === 'DB').length,
    JWT: SECRET_TABLE_DATA.filter(s => s.type === 'JWT').length,
    SSH: SECRET_TABLE_DATA.filter(s => s.type === 'SSH').length,
  };

  const criticalExposures = SECRET_TABLE_DATA.filter(s => s.status === 'Exploited' || s.status === 'Compromised' || s.status === 'Exposed').length;
  const totalSecrets = SECRET_TABLE_DATA.length;
  const hostsCompromised = 3;

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'AWS': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'DB': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'JWT': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'SSH': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'API': return 'bg-green-500/10 text-green-500 border-green-500/20';
      default: return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Valid': case 'Active': return 'text-emerald-500 bg-emerald-500/10';
      case 'Exploited': case 'Compromised': case 'Exposed': return 'text-red-500 bg-red-500/10';
      case 'Forged': return 'text-amber-500 bg-amber-500/10';
      default: return 'text-gray-500 bg-gray-500/10';
    }
  };

  const filteredData = SECRET_TABLE_DATA.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div ref={panelRef} className="space-y-6 h-full flex flex-col pb-12">
      <PanelHeader title="Secrets & Credentials" subtitle="High-value credentials and secrets extracted from targets" badge={`${SECRET_TABLE_DATA.length} SECRETS`} />
      
      <div className="grid grid-cols-4 gap-4">
        <div className="secret-card rounded-xl p-4 shadow-sm border flex flex-col justify-center hover:shadow-md transition-all bg-[var(--swarm-card)] border-[var(--swarm-border)]" onMouseEnter={(e) => onHover(e, true)} onMouseLeave={(e) => onHover(e, false)}>
           <div className="flex items-center gap-2 mb-1">
              <Key size={14} className="text-orange-500" />
              <div className="text-[10px] font-bold tracking-wide text-[var(--swarm-text-muted)]">AWS KEYS</div>
            </div>
            <div className="text-2xl font-light font-bold text-[var(--swarm-text)]">{counts.AWS}</div>
        </div>
        <div className="secret-card rounded-xl p-4 shadow-sm border flex flex-col justify-center hover:shadow-md transition-all bg-[var(--swarm-card)] border-[var(--swarm-border)]" onMouseEnter={(e) => onHover(e, true)} onMouseLeave={(e) => onHover(e, false)}>
           <div className="flex items-center gap-2 mb-1">
              <Database size={14} className="text-blue-500" />
              <div className="text-[10px] font-bold tracking-wide text-[var(--swarm-text-muted)]">DB CREDS</div>
            </div>
            <div className="text-2xl font-light font-bold text-[var(--swarm-text)]">{counts.DB}</div>
        </div>
        <div className="secret-card rounded-xl p-4 shadow-sm border flex flex-col justify-center hover:shadow-md transition-all bg-[var(--swarm-card)] border-[var(--swarm-border)]" onMouseEnter={(e) => onHover(e, true)} onMouseLeave={(e) => onHover(e, false)}>
           <div className="flex items-center gap-2 mb-1">
              <Shield size={14} className="text-purple-500" />
              <div className="text-[10px] font-bold tracking-wide text-[var(--swarm-text-muted)]">JWT TOKENS</div>
            </div>
            <div className="text-2xl font-light font-bold text-[var(--swarm-text)]">{counts.JWT}</div>
        </div>
        <div className="secret-card rounded-xl p-4 shadow-sm border flex flex-col justify-center hover:shadow-md transition-all bg-[var(--swarm-card)] border-[var(--swarm-border)]" onMouseEnter={(e) => onHover(e, true)} onMouseLeave={(e) => onHover(e, false)}>
           <div className="flex items-center gap-2 mb-1">
              <FileKey size={14} className="text-red-500" />
              <div className="text-[10px] font-bold tracking-wide text-[var(--swarm-text-muted)]">SSH KEYS</div>
            </div>
            <div className="text-2xl font-light font-bold text-[var(--swarm-text)]">{counts.SSH}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="intel-panel rounded-xl p-4 border bg-[var(--swarm-card)] border-[var(--swarm-border)]">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-red-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--swarm-text-muted)]">Exposure Risk Summary</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{criticalExposures}</div>
              <div className="text-[9px] font-mono text-[var(--swarm-text-muted)]">Critical</div>
            </div>
            <div className="text-center border-l border-[var(--swarm-border)]">
              <div className="text-2xl font-bold text-[var(--swarm-text)]">{totalSecrets}</div>
              <div className="text-[9px] font-mono text-[var(--swarm-text-muted)]">Secrets</div>
            </div>
            <div className="text-center border-l border-[var(--swarm-border)]">
              <div className="text-2xl font-bold text-[var(--swarm-text)]">{hostsCompromised}</div>
              <div className="text-[9px] font-mono text-[var(--swarm-text-muted)]">Hosts</div>
            </div>
          </div>
        </div>

        <div className="intel-panel rounded-xl p-4 border bg-[var(--swarm-card)] border-[var(--swarm-border)] col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Target size={16} className="text-[var(--swarm-accent)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--swarm-text-muted)]">Top Source Vectors</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SOURCE_VECTORS.map((vector, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--swarm-bg)] border border-[var(--swarm-border)]">
                <vector.icon size={12} className="text-[var(--swarm-text-muted)]" />
                <span className="text-xs text-[var(--swarm-text)]">{vector.label}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--swarm-accent)]/10 text-[var(--swarm-accent)]">{vector.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--swarm-text-muted)]" />
          <input
            type="text"
            placeholder="Search secrets by name, type, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-[var(--swarm-card)] border-[var(--swarm-border)] text-[var(--swarm-text)] placeholder:text-[var(--swarm-text-muted)] focus:border-[var(--swarm-accent)] outline-none text-sm"
          />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--swarm-border)] overflow-hidden bg-[var(--swarm-card)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--swarm-border)] bg-[var(--swarm-bg)]">
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--swarm-text-muted)]">#</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--swarm-text-muted)]">Type</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--swarm-text-muted)]">Secret Name</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--swarm-text-muted)]">Target / Location</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--swarm-text-muted)]">Preview</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--swarm-text-muted)]">Status</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--swarm-text-muted)]">Agent</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--swarm-text-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--swarm-border)]">
            {filteredData.map((s) => {
              const isRevealed = revealedMap[s.id] ?? false;
              return (
                <tr key={s.id} className="hover:bg-[var(--swarm-bg)] transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-[var(--swarm-text-muted)]">{s.id}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getTypeColor(s.type)}`}>
                      {s.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-mono font-bold text-[var(--swarm-text)]">{s.name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs font-mono text-[var(--swarm-text-muted)]">{s.location}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs bg-[var(--swarm-bg)] text-[var(--swarm-text)] border border-[var(--swarm-border)] rounded px-2 py-1.5 max-w-[200px] truncate">
                      {isRevealed ? s.value : '••••••••••••••••••••••••'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider ${getStatusColor(s.status)}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-[var(--swarm-text-muted)]">{s.agent}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => toggleReveal(s.id)} 
                        className="p-1.5 rounded-md hover:bg-[var(--swarm-bg)] border border-[var(--swarm-border)] text-[var(--swarm-accent)] transition-colors"
                        title={isRevealed ? "Hide" : "Reveal"}
                      >
                        {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button 
                        onClick={(e) => handleCopy(e, s.value)} 
                        className="p-1.5 rounded-md hover:bg-[var(--swarm-bg)] border border-[var(--swarm-border)] text-[var(--swarm-accent)] transition-colors"
                        title="Copy"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-auto pt-4 border-t border-[var(--swarm-border)]">
        <div className="flex items-center gap-2 text-xs text-[var(--swarm-text-muted)]">
          <AlertTriangle size={14} className="text-amber-500" />
          <span>Secrets shown in dark code blocks for visibility. Click eye icon to reveal full values.</span>
        </div>
      </div>
    </div>
  );
};