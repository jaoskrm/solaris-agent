import React from 'react';
import { Globe, Coffee, Database, Atom, Lock, Circle } from 'lucide-react';

export const ReconnaissancePanel: React.FC = () => {
  return (
    <div className="max-w-[1600px] h-full flex flex-col pb-12">
      <div className="mb-8 shrink-0">
        <h1 className="text-4xl text-[#1A1714] font-serif">
          Reconnaissance <span className="italic text-[#D97706]/80">Data</span>
        </h1>
      </div>

      <div className="flex flex-col gap-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#1A1714]/10 rounded-xl overflow-hidden shadow-sm flex flex-col">
            <div className="p-4 border-b border-[#1A1714]/5 flex justify-between items-center bg-white">
              <div>
                <h3 className="font-bold text-[#1A1714] text-[14px]">Open Ports</h3>
                <p className="text-[11px] font-mono text-gray-400 mt-0.5">192.168.0.0/24</p>
              </div>
              <span className="px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-[10px] uppercase font-mono tracking-wide text-amber-700 font-bold">
                22 Open
              </span>
            </div>
            
            <table className="w-full text-left border-collapse bg-white">
              <thead>
                <tr className="border-b border-[#1A1714]/10 text-[10px] font-mono font-bold text-gray-400 tracking-widest uppercase bg-gray-50/50">
                  <th className="px-5 py-3 w-16">Port</th>
                  <th className="px-5 py-3 w-28">Service</th>
                  <th className="px-5 py-3">Banner</th>
                  <th className="px-5 py-3 w-28 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1714]/5">
                {[
                  { port: '22', svc: 'ssh', banner: 'OpenSSH 8.9p1 Ubuntu', status: 'Open', color: 'green' },
                  { port: '80', svc: 'http', banner: 'nginx/1.25.3', status: 'Open', color: 'green' },
                  { port: '443', svc: 'ssl/http', banner: 'nginx/1.25.3 · TLSv1.3', status: 'Open', color: 'green' },
                  { port: '3306', svc: 'mysql', banner: 'MySQL 8.0.36-0ubuntu0', status: 'Open', color: 'green' },
                  { port: '6379', svc: 'redis', banner: 'Redis 7.2.4 · no auth', status: 'Exposed', color: 'red' },
                  { port: '8443', svc: 'ssl/http', banner: 'Apache-Coyote/1.1 Tomcat', status: 'Exploited', color: 'red' },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-[12px] font-mono font-bold text-[#1A1714]">{row.port}</td>
                    <td className="px-5 py-3 text-[12px] font-mono text-[#6B6560]">{row.svc}</td>
                    <td className="px-5 py-3 text-[12px] font-mono text-gray-400">{row.banner}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide flex inline-flex items-center justify-center w-[75px]
                        ${row.color === 'green' ? 'text-emerald-700 bg-emerald-50/50 border-emerald-200' : ''}
                        ${row.color === 'red' ? 'text-red-700 bg-red-50/50 border-red-200' : ''}
                      `}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-[#1A1714]/10 rounded-xl overflow-hidden shadow-sm flex flex-col">
            <div className="p-4 border-b border-[#1A1714]/5 bg-white">
              <h3 className="font-bold text-[#1A1714] text-[14px]">Technology Stack</h3>
              <p className="text-[10px] font-mono font-medium text-gray-400 uppercase tracking-widest mt-1">Fingerprinted Components</p>
            </div>
            
            <div className="divide-y divide-[#1A1714]/5 bg-white">
              {[
                { icon: <Globe size={16} className="text-blue-500" />, name: 'nginx/1.25.3', badge: 'Web server', bColor: 'gray', sub: 'No CVEs', subColor: 'text-gray-400' },
                { icon: <Coffee size={16} className="text-[#8D6E63]" />, name: 'Apache Tomcat 10.1.31', badge: 'Vulnerable', bColor: 'red', sub: 'CVE-2024-1234', subColor: 'text-red-400' },
                { icon: <Circle fill="currentColor" size={14} className="text-red-500 mx-0.5" />, name: 'Redis 7.2.4', badge: 'Exposed', bColor: 'amber', sub: 'No auth', subColor: 'text-gray-400' },
                { icon: <Database size={16} className="text-blue-400" />, name: 'MySQL 8.0.36', badge: 'Database', bColor: 'gray', sub: 'Checking...', subColor: 'text-gray-400' },
                { icon: <Atom size={16} className="text-purple-500" />, name: 'React 18.2.0', badge: 'Frontend', bColor: 'gray', sub: 'No CVEs', subColor: 'text-gray-400' },
                { icon: <Lock size={16} className="text-amber-500" />, name: 'TLS 1.3 · cert: acme.corp', badge: 'TLS', bColor: 'gray', sub: 'Expires Jun 2026', subColor: 'text-gray-400' },
              ].map((tech, i) => (
                <div key={i} className="flex items-center p-3 hover:bg-gray-50/50 transition-colors">
                  <div className="w-8 flex justify-center shrink-0">{tech.icon}</div>
                  <div className="flex-1 text-[13px] font-mono font-medium text-[#1A1714]">{tech.name}</div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide
                      ${tech.bColor === 'gray' ? 'text-gray-500 bg-gray-50 border-gray-200' : ''}
                      ${tech.bColor === 'red' ? 'text-red-600 bg-red-50 border-red-200' : ''}
                      ${tech.bColor === 'amber' ? 'text-amber-700 bg-amber-50 border-amber-200' : ''}
                    `}>
                      {tech.badge}
                    </span>
                    <span className={`text-[11px] font-mono text-right w-24 ${tech.subColor}`}>{tech.sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        <div className="bg-white border border-[#1A1714]/10 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[#1A1714]/5 flex justify-between items-center bg-white">
            <div>
              <h3 className="font-bold text-[#1A1714] text-[14px]">Discovered Subdomains</h3>
              <p className="text-[10px] font-mono font-medium text-gray-400 uppercase tracking-widest mt-1">Via CT Logs, DNS Brute, OSINT</p>
            </div>
            <span className="px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-[10px] uppercase font-mono tracking-wide text-emerald-700 font-bold">
              28 Found
            </span>
          </div>

          <div className="divide-y divide-[#1A1714]/5 bg-white">
            {[
              { dom: 'acme.corp', badge: 'Main', bColor: 'gray', ip: '192.168.0.1' },
              { dom: 'api.acme.corp', badge: 'SQLi found', bColor: 'red', ip: '192.168.0.2' },
              { dom: 'admin.acme.corp', badge: 'Default creds', bColor: 'amber', ip: '192.168.0.1' },
              { dom: 'internal.acme.corp', badge: 'Internal', bColor: 'gray', ip: '10.0.0.1' },
              { dom: 'staging.acme.corp', badge: 'Staging', bColor: 'gray', ip: '192.168.0.5' },
              { dom: 'jenkins.acme.corp', badge: 'No auth', bColor: 'amber', ip: '192.168.0.8' },
            ].map((sub, i) => (
              <div key={i} className="flex items-center p-3.5 hover:bg-gray-50/50 transition-colors">
                <div className="w-8 flex justify-center shrink-0">
                  <Globe size={16} className="text-blue-400" />
                </div>
                <div className="flex-1 text-[13px] font-mono font-medium text-blue-500">{sub.dom}</div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide
                    ${sub.bColor === 'gray' ? 'text-gray-500 bg-gray-50 border-gray-200' : ''}
                    ${sub.bColor === 'red' ? 'text-red-600 bg-red-50 border-red-200' : ''}
                    ${sub.bColor === 'amber' ? 'text-amber-700 bg-amber-50 border-amber-200' : ''}
                  `}>
                    {sub.badge}
                  </span>
                  <span className="text-[12px] font-mono text-gray-400 text-right w-24">{sub.ip}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};