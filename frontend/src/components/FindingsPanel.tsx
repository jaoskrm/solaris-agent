import React, { useState } from 'react';
import { useSwarmStore } from '../store/swarm';
import { ChevronDown, Check, AlertTriangle } from 'lucide-react';

const findingsData = [
  { id: '01', title: 'RCE — Apache Tomcat CVE-2024-1234', sub: '/manager endpoint · unauthenticated', sev: 'Critical', loc: ':8443', cvss: '9.8', agent: 'EXPLOIT', status: 'EXPLOITED', sColor: 'red',
    description: 'Remote code execution vulnerability in Apache Tomcat manager interface through malicious WAR file upload. Allows unauthenticated attackers to deploy malicious web archives and gain shell access.',
    code: 'POST /manager/html/upload HTTP/1.1\nHost: target.acme.corp:8443\nContent-Type: multipart/form-data\n\n--Boundary\nContent-Disposition: form-data; name="deploy"; filename="shell.war"\n[malicious payload here]',
    analysis: 'The manager application allows unauthenticated file uploads without proper validation. The deployed WAR file executes JSP code with privileges of the Tomcat process (uid=0)',
    fix: 'Disable the manager HTML interface or require strong authentication. Implement CSRF tokens. Restrict deployment to authorized IP ranges only.' },
  { id: '02', title: 'Domain Admin via Kerberoasting', sub: 'SPN: HTTP/intranet.acme.corp', sev: 'Critical', loc: 'DC-01', cvss: '9.1', agent: 'EXPLOIT', status: 'EXPLOITED', sColor: 'red',
    description: 'Kerberoasting attack successfully extracted TGS tickets for service accounts with SPNs. Offline password cracking in progress.',
    code: 'GetUserSPNs -Domain ad.acme.corp -ExportTGT',
    analysis: 'Service accounts with SPNs are vulnerable to Kerberoasting. Weak password policy enabled offline cracking attack.',
    fix: 'Implement strong password policy (25+ chars). Use Managed Service Accounts (MSAs). Enable AES encryption.' },
  { id: '03', title: 'SSRF → AWS IMDSv1 Credential Exfil', sub: 'IMDSv1 accessible · IAM keys exposed', sev: 'Critical', loc: 'api.acme.corp', cvss: '8.8', agent: 'EXPLOIT', status: 'EXPLOITED', sColor: 'red',
    description: 'Server-side request forgery leading to AWS IMDSv1 metadata endpoint access. Successfully extracted temporary AWS credentials.',
    code: 'GET /proxy?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/admin-role',
    analysis: 'EC2 instance has IMDSv1 enabled without token restriction. SSRF allows metadata access and credential exfiltration.',
    fix: 'Enable IMDSv2. Block metadata traffic from application users. Use VPC endpoints for AWS services.' },
  { id: '04', title: 'SQL Injection — UNION-based', sub: '/api/v2/users?id= parameter', sev: 'High', loc: 'api.acme.corp', cvss: '8.1', agent: 'EXPLOIT', status: 'VERIFIED', sColor: 'orange',
    description: 'Blind SQL injection in user search endpoint. Data exfiltration confirmed via UNION-based extraction.',
    code: "GET /api/v2/users?id=1' UNION SELECT username,password FROM users--",
    analysis: 'Input not properly sanitized before SQL query construction. Allows union-based data extraction.',
    fix: 'Use parameterized queries. Implement input validation. Apply least privilege to database user.' },
  { id: '05', title: 'JWT Algorithm Confusion (none/HS256)', sub: 'Forged tokens accepted as admin', sev: 'High', loc: '/auth/token', cvss: '8.0', agent: 'EXPLOIT', status: 'VERIFIED', sColor: 'orange',
    description: 'JWT implementation accepts both "none" algorithm and asymmetric keys as HS256, allowing token forgery.',
    code: "header: { 'alg': 'none' }\npayload: { 'sub': 'admin', 'role': 'admin' }",
    analysis: 'JWT library does not properly validate algorithm against configured list. Accepts alg: none or mismatches key type.',
    fix: 'Explicitly whitelist allowed algorithms. Verify key type matches declared algorithm. Use secure key management.' },
  { id: '06', title: 'Leaked credentials in public GitHub repo', sub: 'acme-corp/deploy-scripts · 3 accounts', sev: 'High', loc: 'GitHub', cvss: '7.8', agent: 'RESEARCH', status: 'VERIFIED', sColor: 'orange',
    description: 'Hardcoded AWS credentials and database passwords found in public GitHub repository.',
    code: '# AWS Credentials (PROD)\nAWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET_ACCESS_KEY=wJalrXUznFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    analysis: 'Developer accidentally committed production credentials to public GitHub repository. Credentials have full AWS and database access.',
    fix: 'Implement git-secrets hook. Use AWS Secrets Manager. Rotate all exposed credentials immediately.' },
  { id: '07', title: 'Unauthenticated Redis instance', sub: 'No AUTH required · keyspace readable', sev: 'Medium', loc: ':6379', cvss: '6.5', agent: 'RECON', status: 'FOUND', sColor: 'blue',
    description: 'Redis instance exposed without authentication. Confirmed read/write access to all keys.',
    code: 'redis-cli -h 192.168.0.45 -p 6379\n> KEYS *',
    analysis: 'Redis bound to public interface without AUTH. All keys accessible without authentication.',
    fix: 'Bind Redis to localhost only. Enable AUTH. Restrict via firewall rules.' },
  { id: '08', title: 'CORS misconfiguration — wildcard origin', sub: 'Credentials forwarded from any origin', sev: 'Medium', loc: 'api.acme.corp', cvss: '6.1', agent: 'RECON', status: 'FOUND', sColor: 'blue',
    description: 'CORS configured with Access-Control-Allow-Origin: * allowing cross-origin credential theft.',
    code: 'Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true',
    analysis: 'Wildcard CORS combined with credentials allow enables cross-origin attacks on authenticated users.',
    fix: 'Explicitly whitelist trusted domains. Remove credentials header from wildcard responses.' },
  { id: '09', title: 'Exposed .env file — database credentials', sub: '/admin/.env publicly accessible', sev: 'High', loc: '/admin/.env', cvss: '7.5', agent: 'RECON', status: 'FOUND', sColor: 'orange',
    description: 'Environment file with database credentials exposed at /admin/.env path.',
    code: 'DATABASE_URL=postgresql://admin:password123@db.acme.corp:5432/main',
    analysis: 'Web server configuration allows serving .env files. Contains plaintext database credentials.',
    fix: 'Block .env files in web server config. Move secrets outside web root. Use environment-specific secret management.' },
  { id: '10', title: 'Default admin credentials — Tomcat Manager', sub: 'tomcat:tomcat accepted on /manager', sev: 'High', loc: ':8443/manager', cvss: '7.3', agent: 'EXPLOIT', status: 'VERIFIED', sColor: 'orange',
    description: 'Default Tomcat manager credentials still active. Allows unauthorized WAR deployment.',
    code: 'Authorization: Basic dG9tY2F0dG90b21jYXQ=', analysis: 'Default credentials never changed. Provides unauthenticated access to manager interface.',
    fix: 'Immediately change default passwords. Disable manager interface in production. Implement IP-based access controls.' },
  { id: '11', title: 'Information disclosure via HTTP headers', sub: 'Server version exposed in headers', sev: 'Low', loc: 'api.acme.corp', cvss: '3.5', agent: 'RECON', status: 'FOUND', sColor: 'gray',
    description: 'Server reveals version information in HTTP response headers.',
    code: 'Server: nginx/1.25.3\nX-Powered-By: Express', analysis: 'Detailed server version information aids attackers in targeting known vulnerabilities.',
    fix: 'Strip version headers. Use generic server string.' },
  { id: '12', title: 'Missing security headers', sub: 'CSP and HSTS not configured', sev: 'Low', loc: 'acme.corp', cvss: '3.3', agent: 'RECON', status: 'FOUND', sColor: 'gray',
    description: 'Missing Content-Security-Policy and HSTS headers.',
    code: 'curl -I https://acme.corp\n< HTTP/2 200\n< Server: nginx', analysis: 'Missing security headers reduces protection against XSS and clickjacking.',
    fix: 'Implement CSP header. Enable HSTS with includeSubDomains.' },
];

export const FindingsPanel: React.FC = () => {
  const { theme } = useSwarmStore();
  const [filter, setFilter] = useState<string>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isDark = theme === 'charcoal' || theme === 'black';

  const filteredData = filter === 'All' 
    ? findingsData 
    : filter === 'Low'
    ? findingsData.filter(f => f.sev === 'Low')
    : findingsData.filter(f => f.sev === filter);

  const counts = {
    All: findingsData.length,
    Critical: findingsData.filter(f => f.sev === 'Critical').length,
    High: findingsData.filter(f => f.sev === 'High').length,
    Medium: findingsData.filter(f => f.sev === 'Medium').length,
    Low: findingsData.filter(f => f.sev === 'Low').length,
  };

  const exploitedCount = findingsData.filter(f => f.status === 'EXPLOITED').length;
  const totalCount = findingsData.length;
  const exploitationRate = Math.round((exploitedCount / totalCount) * 100);
  
  const cvssSum = findingsData.reduce((acc, f) => acc + parseFloat(f.cvss), 0);
  const avgCvss = (cvssSum / totalCount).toFixed(1);
  
  const locCounts: Record<string, number> = {};
  findingsData.forEach(f => { locCounts[f.loc] = (locCounts[f.loc] || 0) + 1; });
  const sortedLocs = Object.entries(locCounts).sort((a, b) => b[1] - a[1]);
  const topLocation = sortedLocs[0]?.[0] || 'N/A';
  
  const agentCountsMap: Record<string, number> = {};
  findingsData.forEach(f => { agentCountsMap[f.agent] = (agentCountsMap[f.agent] || 0) + 1; });
  const sortedAgents = Object.entries(agentCountsMap).sort((a, b) => b[1] - a[1]);
  const topAgent = sortedAgents[0]?.[0] || 'N/A';

  return (
    <div className="max-w-[1600px] pb-12">
      <div className="mb-8">
        <h1 className="text-4xl font-light mb-6 text-[var(--swarm-text)]">
          Vulnerability <span className="italic text-amber-600/80">Findings</span>
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={() => setFilter('All')}
            className="px-4 py-1.5 rounded-full text-xs font-mono tracking-wide transition-colors border border-[var(--swarm-border)]"
            style={{
              background: filter === 'All' ? 'var(--swarm-text)' : 'var(--swarm-card)',
              color: filter === 'All' ? 'var(--swarm-card)' : 'var(--swarm-text)',
            }}
          >
            All ({counts.All})
          </button>
          <button 
            onClick={() => setFilter('Critical')}
            className="px-4 py-1.5 rounded-full text-xs font-mono tracking-wide transition-colors border border-[var(--swarm-border)]"
            style={{
              background: filter === 'Critical' ? '#DC2626' : 'var(--swarm-card)',
              color: filter === 'Critical' ? '#FFFFFF' : 'var(--swarm-text)',
            }}
          >
            Critical ({counts.Critical})
          </button>
          <button 
            onClick={() => setFilter('High')}
            className="px-4 py-1.5 rounded-full text-xs font-mono tracking-wide transition-colors border border-[var(--swarm-border)]"
            style={{
              background: filter === 'High' ? '#D97706' : 'var(--swarm-card)',
              color: filter === 'High' ? '#FFFFFF' : 'var(--swarm-text)',
            }}
          >
            High ({counts.High})
          </button>
          <button 
            onClick={() => setFilter('Medium')}
            className="px-4 py-1.5 rounded-full text-xs font-mono tracking-wide transition-colors border border-[var(--swarm-border)]"
            style={{
              background: filter === 'Medium' ? '#2563EB' : 'var(--swarm-card)',
              color: filter === 'Medium' ? '#FFFFFF' : 'var(--swarm-text)',
            }}
          >
            Medium ({counts.Medium})
          </button>
          <button 
            onClick={() => setFilter('Low')}
            className="px-4 py-1.5 rounded-full text-xs font-mono tracking-wide transition-colors border border-[var(--swarm-border)]"
            style={{
              background: filter === 'Low' ? '#6B7280' : 'var(--swarm-card)',
              color: filter === 'Low' ? '#FFFFFF' : 'var(--swarm-text)',
            }}
          >
            Low ({counts.Low})
          </button>
        </div>
      </div>

      <div className="rounded-xl shadow-sm overflow-hidden border border-[var(--swarm-border)] bg-[var(--swarm-card)]">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[var(--swarm-bg)]">
            <tr className="border-b text-[10px] font-mono font-bold tracking-widest uppercase text-[var(--swarm-text-muted)]" style={{ borderColor: 'var(--swarm-border)' }}>
              <th className="px-5 py-3 w-12 text-center">#</th>
              <th className="px-5 py-3">Vulnerability</th>
              <th className="px-5 py-3 w-32">Severity</th>
              <th className="px-5 py-3 w-40 text-left">Location</th>
              <th className="px-5 py-3 w-20 text-center">CVSS</th>
              <th className="px-5 py-3 w-24 text-center">Agent</th>
              <th className="px-5 py-3 w-32 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--swarm-border)]">
            {filteredData.map((row, i) => (
              <React.Fragment key={row.id}>
                <tr 
                  onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                  className="hover:bg-[var(--swarm-bg)] transition-colors cursor-pointer group border-b border-[var(--swarm-border)]"
                >
                  <td className="px-5 py-3 text-[11px] font-mono text-center text-[var(--swarm-text-muted)]">{row.id}</td>
                  <td className="px-5 py-3">
                    <div className="text-[13px] font-medium text-[var(--swarm-text)]">{row.title}</div>
                    <div className="text-[11px] font-mono mt-0.5 text-[var(--swarm-text-muted)]">{row.sub}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-0.5 rounded border text-[10px] uppercase font-mono tracking-wide font-bold
                      ${row.sColor === 'red' ? 'bg-red-500/10 text-red-500 border-red-500/20' : ''}
                      ${row.sColor === 'orange' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : ''}
                      ${row.sColor === 'blue' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : ''}
                    `}>{row.sev}</span>
                  </td>
                  <td className="px-5 py-3 text-[12px] font-mono truncate text-[var(--swarm-text-muted)]">{row.loc}</td>
                  <td className="px-5 py-3 text-[12px] font-mono font-bold text-center text-[var(--swarm-text)]">{row.cvss}</td>
                  <td className="px-5 py-3 text-[10px] font-mono uppercase text-center text-[var(--swarm-text-muted)]">{row.agent}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-sm border text-[10px] uppercase font-mono tracking-wide font-bold
                      ${row.status === 'EXPLOITED' ? 'bg-red-500/10 text-red-500 border-red-500/20' : ''}
                      ${row.status === 'VERIFIED' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : ''}
                      ${row.status === 'FOUND' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : ''}
                    `}>{row.status}</span>
                  </td>
                </tr>
                {expandedId === row.id && row.description && (
                  <tr className="bg-[var(--swarm-bg)] border-t border-[var(--swarm-border)]">
                    <td colSpan={7} className="px-5 py-4">
                      <div className="flex flex-col gap-4">
                        <div>
                          <div className="text-xs font-semibold mb-2 text-[var(--swarm-text-muted)]">Description</div>
                          <div className="text-sm text-[var(--swarm-text)]">{row.description}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold mb-2 text-[var(--swarm-text-muted)]">Code Snippet</div>
                          <div className="bg-[#09090b] text-[#e4e4e7] border border-[#27272a] shadow-inner font-mono rounded-md text-sm p-4 whitespace-pre-wrap">{row.code}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold mb-2 text-[var(--swarm-text-muted)]">Analysis</div>
                          <div className="text-sm text-[var(--swarm-text)]">{row.analysis}</div>
                        </div>
                        <div className="border rounded-lg p-4" style={{ background: isDark ? 'rgba(16,185,129,0.1)' : 'rgba(5,150,105,0.1)', borderColor: isDark ? 'rgba(16,185,129,0.3)' : 'rgba(5,150,105,0.3)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Check size={16} className="text-emerald-500" />
                            <div className="text-xs font-semibold text-emerald-500">Fix Suggestion</div>
                          </div>
                          <div className="text-sm text-[var(--swarm-text)]">{row.fix}</div>
                        </div>
                        <div className="text-xs text-[var(--swarm-text-muted)]">
                          Confidence: <span className="text-emerald-500 font-semibold">high</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10">
        <h2 className="text-2xl font-light mb-6 text-[var(--swarm-text)]">Findings <span className="italic text-[#D97706]/80">Summary</span></h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl p-5 shadow-sm bg-[var(--swarm-card)] border border-[var(--swarm-border)]">
            <div className="text-[10px] font-bold mb-2 tracking-wide text-[var(--swarm-text-muted)]">EXPLOITATION RATE</div>
            <div className={`text-4xl font-light font-bold ${exploitationRate >= 50 ? 'text-red-600' : ''}`} style={{ color: isDark ? 'var(--swarm-text)' : 'var(--swarm-text)' }}>{exploitationRate}%</div>
            <div className="text-[9px] font-mono mt-1 text-[var(--swarm-text-muted)]">Of findings compromised</div>
          </div>
          <div className="rounded-xl p-5 shadow-sm bg-[var(--swarm-card)] border border-[var(--swarm-border)]">
            <div className="text-[10px] font-bold mb-2 tracking-wide text-[var(--swarm-text-muted)]">AVG CVSS SCORE</div>
            <div className="text-4xl font-light font-bold text-[var(--swarm-text)]">{avgCvss}</div>
            <div className="text-[9px] font-mono mt-1 text-[var(--swarm-text-muted)]">Mean severity score</div>
          </div>
          <div className="rounded-xl p-5 shadow-sm bg-[var(--swarm-card)] border border-[var(--swarm-border)]">
            <div className="text-[10px] font-bold mb-2 tracking-wide text-[var(--swarm-text-muted)]">TOP VULNERABLE ASSET</div>
            <div className="text-xl font-light font-bold truncate text-[var(--swarm-text)]">{topLocation}</div>
            <div className="text-[9px] font-mono mt-1 text-[var(--swarm-text-muted)]">Most targeted endpoint</div>
          </div>
          <div className="rounded-xl p-5 shadow-sm bg-[var(--swarm-card)] border border-[var(--swarm-border)]">
            <div className="text-[10px] font-bold mb-2 tracking-wide text-[var(--swarm-text-muted)]">MOST ACTIVE AGENT</div>
            <div className="text-2xl font-light font-bold text-[var(--swarm-text)]">{topAgent}</div>
            <div className="text-[9px] font-mono mt-1 text-[var(--swarm-text-muted)]">Highest findings count</div>
          </div>
        </div>
      </div>
    </div>
  );
};