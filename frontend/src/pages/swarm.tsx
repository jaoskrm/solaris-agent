import { useState, useMemo } from 'react'
import { 
  CommandPalette, 
  Badge, 
  Card, 
  ProgressBar 
} from '@/components/Shared'
import { cn } from '@/lib/utils'
import { useSwarmStore, Agent, Finding, Exploit, Secret } from '@/stores/swarm'
import { 
  Activity, 
  Target, 
  Search, 
  Terminal, 
  keyframes, 
  Cpu, 
  Lock, 
  FileText, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Zap,
  ChevronDown,
  Play,
  Pause,
  Square,
  Skull,
  Eye,
  EyeOff,
  ChevronUp,
  Server,
  Bug,
  FileJson,
  TerminalIcon,
  RefreshCw
} from 'lucide-react'

const slideIn = keyframes({ 
  '0%': { transform: 'translateY(10px)', opacity: 0 }, 
  '100%': { transform: 'translateY(0)', opacity: 1 } 
})

const pulse = keyframes({ 
  '0%, 100%': { opacity: 1 }, 
  '50%': { opacity: 0.5 } 
})

const spin = keyframes({ 
  '0%': { transform: 'rotate(0deg)' }, 
  '100%': { transform: 'rotate(360deg)' } 
})

const statusColors: Record<string, string> = {
  Running: 'bg-blue-500',
  Idle: 'bg-gray-500',
  Offline: 'bg-gray-800',
}

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  Critical: { bg: 'bg-red-950', text: 'text-red-400', border: 'border-red-800' },
  High: { bg: 'bg-orange-950', text: 'text-orange-400', border: 'border-orange-800' },
  Medium: { bg: 'bg-yellow-950', text: 'text-yellow-400', border: 'border-yellow-800' },
  Low: { bg: 'bg-blue-950', text: 'text-blue-400', border: 'border-blue-800' },
}

function FindingStatusBadge({ status }: { status: string }) {
  const colors = {
    Open: 'text-red-400 bg-red-950',
    Triaged: 'text-yellow-400 bg-yellow-950',
    Fixed: 'text-green-400 bg-green-950',
  }
  
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded', colors[status] || 'text-gray-400')}>
      {status}
    </span>
  )
}

function AgentCard({ 
  agent, 
  isSelected, 
  onClick 
}: { 
  agent: Agent; 
  isSelected: boolean; 
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false)
  
  return (
    <div 
      onClick={onClick}
      className={cn(
        'p-4 rounded-lg border transition-all cursor-pointer',
        isSelected 
          ? 'border-cyan-500 bg-cyan-950/30' 
          : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', statusColors[agent.status])}>
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-200">{agent.name}</h3>
            <div className="flex items-center gap-2">
              <div className={cn('w-2 h-2 rounded-full', statusColors[agent.status])} />
              <span className="text-xs text-gray-400 capitalize">{agent.status}</span>
            </div>
          </div>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="p-1 hover:bg-gray-800 rounded"
        >
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
      </div>
      
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Role</p>
              <p className="text-sm text-gray-300">{agent.role}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Task</p>
              <p className="text-sm text-gray-300">{agent.task}</p>
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Progress</span>
              <span>{agent.prog}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-cyan-500 transition-all"
                style={{ width: `${agent.prog}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false)
  const colors = severityColors[finding.sev] || severityColors.Low
  
  return (
    <div 
      onClick={() => setExpanded(!expanded)}
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all',
        colors.bg, colors.border
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn('w-4 h-4', colors.text)} />
            <span className={cn('text-xs font-medium uppercase', colors.text)}>{finding.sev}</span>
            <FindingStatusBadge status={finding.status} />
          </div>
          <h3 className="text-sm font-medium text-gray-200 mt-1">{finding.title}</h3>
          <p className="text-xs text-gray-500 mt-1">{finding.loc}</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </div>
      
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <p className="text-sm text-gray-300">{finding.desc}</p>
          
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-xs text-gray-500">{finding.timestamp}</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {finding.agent}
            </Badge>
            <Badge variant="outline" className="text-xs">
              CVSS: {finding.cvss}
            </Badge>
          </div>
        </div>
      )}
    </div>
  )
}

function ExploitCard({ exploit }: { exploit: Exploit }) {
  const resultColors = {
    Success: 'text-green-400 border-green-800',
    Failed: 'text-red-400 border-red-800',
    Running: 'text-blue-400 border-blue-800',
  }
  
  const resultIcons = {
    Success: CheckCircle2,
    Failed: XCircle,
    Running: RefreshCw,
  }
  
  const ResultIcon = resultIcons[exploit.result] || Clock
  
  return (
    <div className={cn('p-4 rounded-lg border bg-gray-900/50', resultColors[exploit.result] || 'border-gray-800')}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <ResultIcon className={cn('w-5 h-5', resultColors[exploit.result])} />
          <div>
            <h3 className="text-sm font-medium text-gray-200">{exploit.tech}</h3>
            <p className="text-xs text-gray-500 mt-1">{exploit.target}</p>
          </div>
        </div>
        <span className={cn('text-xs font-medium uppercase', resultColors[exploit.result])}>
          {exploit.result}
        </span>
      </div>
      
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
        <span>CVSS: {exploit.cvss}</span>
        <span>•</span>
        <span>Agent: {exploit.agent}</span>
      </div>
    </div>
  )
}

function SecretCard({ secret, onReveal }: { secret: Secret; onReveal: (key: string) => void }) {
  const iconTypes = {
    AWS: 'text-orange-400',
    JWT: 'text-purple-400',
    DB: 'text-blue-400',
    API: 'text-green-400',
  }
  
  return (
    <div className={cn(
      'p-4 rounded-lg border',
      secret.revealed ? 'bg-green-950/20 border-green-800' : 'bg-gray-900/50 border-gray-800'
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Lock className={cn('w-5 h-5', iconTypes[secret.type])} />
          <div>
            <h3 className="text-sm font-medium text-gray-200">{secret.type}</h3>
            <p className="text-xs text-gray-500 mt-1">{secret.key}</p>
          </div>
        </div>
        <button 
          onClick={() => onReveal(secret.key)}
          className="p-1 hover:bg-gray-800 rounded"
        >
          {secret.revealed ? (
            <EyeOff className="w-4 h-4 text-gray-400" />
          ) : (
            <Eye className="w-4 h-4 text-gray-400" />
          )}
        </button>
      </div>
      
      {secret.revealed && (
        <div className="mt-3 p-3 bg-black rounded-lg">
          <pre className="text-xs text-green-400 font-mono overflow-x-auto">
            {secret.value}
          </pre>
        </div>
      )}
    </div>
  )
}

function OverviewPanel() {
  const { findings, agents, exploits, secrets, logs, metrics, globalRiskScore } = useSwarmStore()
  
  const criticalFindings = findings.filter(f => f.sev === 'Critical' && f.status === 'Open').length
  const openFindings = findings.filter(f => f.status === 'Open').length
  const successfulExploits = exploits.filter(e => e.result === 'Success').length
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
          <Activity className="w-5 h-5 text-cyan-400 mb-2" />
          <p className="text-2xl font-bold text-white">{agents.filter(a => a.status === 'Running').length}</p>
          <p className="text-xs text-gray-500 mt-1">Active Agents</p>
        </div>
        
        <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
          <Search className="w-5 h-5 text-red-400 mb-2" />
          <p className="text-2xl font-bold text-white">
            {openFindings}
            {criticalFindings > 0 && <span className="text-sm text-red-400 ml-1">({criticalFindings} critical)</span>}
          </p>
          <p className="text-xs text-gray-500 mt-1">Open Findings</p>
        </div>
        
        <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
          <Skull className="w-5 h-5 text-orange-400 mb-2" />
          <p className="text-2xl font-bold text-white">
            {successfulExploits}/{exploits.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Successful Exploits</p>
        </div>
        
        <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
          <Target className="w-5 h-5 text-purple-400 mb-2" />
          <p className="text-2xl font-bold text-white">{globalRiskScore}</p>
          <p className="text-xs text-gray-500 mt-1">Risk Score</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
          <h3 className="text-sm font-medium text-gray-200 mb-4">Metrics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">MTTD</p>
              <p className="text-lg text-gray-300">{metrics.mttd}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Success Rate</p>
              <p className="text-lg text-gray-300">{metrics.successRate}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Endpoints</p>
              <p className="text-lg text-gray-300">{metrics.totalEndpoints}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Open Ports</p>
              <p className="text-lg text-gray-300">{metrics.openPorts}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Subdomains</p>
              <p className="text-lg text-gray-300">{metrics.subdomains}</p>
            </div>
          </div>
        </div>
        
        <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
          <h3 className="text-sm font-medium text-gray-200 mb-4">Live Logs</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.slice(-10).reverse().map(log => (
              <div key={log.id} className="text-xs">
                <span className="text-gray-500">[{log.time}]</span>{' '}
                <span className={cn(
                  'font-medium',
                  log.type === 'system' ? 'text-cyan-400' : 
                  log.type === 'commander' ? 'text-green-400' : 'text-white'
                )}>
                  {log.agent}:
                </span>{' '}
                <span className="text-gray-300">{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
        <h3 className="text-sm font-medium text-gray-200 mb-4">Recent Findings</h3>
        <div className="space-y-3">
          {findings.slice(0, 5).map(finding => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AgentsPanel() {
  const [filter, setFilter] = useState<string>('all')
  const { agents, setActiveView } = useSwarmStore()
  
  const filteredAgents = useMemo(() => {
    if (filter === 'all') return agents
    return agents.filter(a => a.status === filter)
  }, [agents, filter])
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs transition-colors',
            filter === 'all' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
          )}
        >
          All ({agents.length})
        </button>
        {(['Running', 'Idle', 'Offline'] as const).map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs transition-colors capitalize',
              filter === status 
                ? `${statusColors[status]}/20 text-white` 
                : 'text-gray-400 hover:text-white'
            )}
          >
            {status} ({agents.filter(a => a.status === status).length})
          </button>
        ))}
      </div>
      
      {filteredAgents.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500">No agents</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAgents.map(agent => (
            <AgentCard 
              key={agent.id} 
              agent={agent} 
              isSelected={false}
              onClick={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FindingsPanel() {
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const { findings, markFinding, runExploit } = useSwarmStore()
  
  const filteredFindings = useMemo(() => {
    return findings.filter(f => {
      if (severityFilter !== 'all' && f.sev !== severityFilter) return false
      if (statusFilter !== 'all' && f.status !== statusFilter) return false
      return true
    })
  }, [findings, severityFilter, statusFilter])
  
  const severityCounts = {
    Critical: findings.filter(f => f.sev === 'Critical').length,
    High: findings.filter(f => f.sev === 'High').length,
    Medium: findings.filter(f => f.sev === 'Medium').length,
    Low: findings.filter(f => f.sev === 'Low').length,
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSeverityFilter('all')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs transition-colors',
            severityFilter === 'all' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
          )}
        >
          All ({findings.length})
        </button>
        {Object.entries(severityCounts).map(([sev, count]) => (
          <button
            key={sev}
            onClick={() => setSeverityFilter(sev)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs transition-colors capitalize',
              severityFilter === sev 
                ? severityColors[sev]?.text 
                : 'text-gray-400 hover:text-white'
            )}
          >
            {sev} ({count})
          </button>
        ))}
      </div>
      
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Status:</span>
        {(['all', 'Open', 'Triaged', 'Fixed'] as const).map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={cn(
              'px-2 py-1 rounded text-xs transition-colors',
              statusFilter === status 
                ? 'bg-gray-700 text-white' 
                : 'text-gray-400 hover:text-white'
            )}
          >
            {status === 'all' ? 'All' : status}
          </button>
        ))}
      </div>
      
      {filteredFindings.length === 0 ? (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500">No findings</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFindings.map(finding => (
            <div key={finding.id} className="space-y-2">
              <FindingCard finding={finding} />
              {finding.status === 'Open' && finding.sev !== 'Low' && (
                <button
                  onClick={() => runExploit(finding.id)}
                  className="w-full py-2 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-colors"
                >
                  Run Exploit
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ExploitsPanel() {
  const { exploits } = useSwarmStore()
  
  const resultCounts = {
    Success: exploits.filter(e => e.result === 'Success').length,
    Failed: exploits.filter(e => e.result === 'Failed').length,
    Running: exploits.filter(e => e.result === 'Running').length,
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500">Results:</span>
        <span className="text-green-400">{resultCounts.Success} success</span>
        <span className="text-red-400">{resultCounts.Failed} failed</span>
        <span className="text-blue-400">{resultCounts.Running} running</span>
      </div>
      
      {exploits.length === 0 ? (
        <div className="text-center py-12">
          <Skull className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500">No exploits executed</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exploits.map(exploit => (
            <ExploitCard key={exploit.id} exploit={exploit} />
          ))}
        </div>
      )}
    </div>
  )
}

function SecretsPanel() {
  const { secrets, revealSecret } = useSwarmStore()
  
  return (
    <div className="space-y-4">
      {secrets.length === 0 ? (
        <div className="text-center py-12">
          <Lock className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500">No secrets found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {secrets.map(secret => (
            <SecretCard 
              key={secret.key} 
              secret={secret}
              onReveal={revealSecret}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Swarm() {
  const { 
    activeView, 
    setActiveView, 
    isCommandPaletteOpen, 
    setCommandPaletteOpen,
    agents,
    findings,
    exploits,
    secrets,
    theme,
    cycleTheme
  } = useSwarmStore()
  
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'agents', label: 'Agents', icon: Cpu },
    { id: 'findings', label: 'Findings', icon: Search, count: findings.filter(f => f.status === 'Open').length },
    { id: 'exploits', label: 'Exploits', icon: Skull, count: exploits.length },
    { id: 'secrets', label: 'Secrets', icon: Lock, count: secrets.filter(s => !s.revealed).length },
  ]
  
  const renderPanel = () => {
    switch (activeView) {
      case 'overview': return <OverviewPanel />
      case 'agents': return <AgentsPanel />
      case 'findings': return <FindingsPanel />
      case 'exploits': return <ExploitsPanel />
      case 'secrets': return <SecretsPanel />
      default: return <OverviewPanel />
    }
  }
  
  return (
    <div className="min-h-screen bg-black text-white">
      {isCommandPaletteOpen && (
        <CommandPalette onClose={() => setCommandPaletteOpen(false)} />
      )}
      
      <div className="flex h-screen">
        <div className="w-16 border-r border-gray-800 flex flex-col items-center py-4 gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={cn(
                  'w-12 h-12 rounded-lg flex items-center justify-center transition-colors relative',
                  activeView === tab.id 
                    ? 'bg-cyan-500/20 text-cyan-400' 
                    : 'text-gray-500 hover:text-white hover:bg-gray-800'
                )}
              >
                <Icon className="w-5 h-5" />
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center">
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
          
          <div className="mt-auto flex flex-col gap-2">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="w-12 h-12 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <TerminalIcon className="w-5 h-5" />
            </button>
            
            <button
              onClick={cycleTheme}
              className="w-12 h-12 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col">
          <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <Target className="w-5 h-5 text-cyan-400" />
              <div>
                <h1 className="text-lg font-medium text-white">Swarm</h1>
                <p className="text-xs text-gray-500">Mission: ACME Corp Penetration Test</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Zap className="w-4 h-4" />
                <span>{agents.filter(a => a.status === 'Running').length} active</span>
              </div>
              
              <Badge variant="outline" className="text-xs">
                {theme}
              </Badge>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-6xl mx-auto">
              {renderPanel()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}