import { BaseAgent, type AgentConfig } from './base-agent.js';
import type { SwarmEvent, SwarmEventType } from '../events/types.js';
import { sectionNodeId } from '../infra/falkordb.js';
import { loadWordlistIndex, getWordlistPath } from '../utils/wordlist-index.js';
import { LLMRouter } from '../core/llm-router.js';
import type { LLMMessage } from '../core/providers/ollama.js';
import { loadAgentPrompt } from '../utils/prompt-loader.js';

interface AlphaScanState {
  sessionId: string;
  target: string;
  targetUrl: string;
  missionId: string;
  phase: 'port_scan' | 'web_enum' | 'tech_fingerprint' | 'sast' | 'complete';
  iteration: number;
  maxIterations: number;
  discoveredEndpoints: Set<string>;
  discoveredComponents: Set<string>;
  discoveredPorts: Set<string>;
  scanSessionActive: boolean;
  useLlmPlanning: boolean;
}

export interface AlphaConfig extends AgentConfig {
  agentType: 'alpha';
  maxIterations?: number;
  scanIntervalMs?: number;
}

export class AlphaAgent extends BaseAgent {
  private scanState: Map<string, AlphaScanState> = new Map();
  private readonly DEFAULT_MAX_ITERATIONS = 3;
  private llmRouter: LLMRouter;
  private lastMemoryPoll = 0;
  private readonly MEMORY_POLL_INTERVAL_MS = 1800000;

  constructor(config: AlphaConfig) {
    super(config);
    this.llmRouter = new LLMRouter();
  }

  protected getSubscriptions(): SwarmEventType[] {
    return [
      'scan_initiated',
      'mission_authorized',
    ];
  }

  async processEvent(event: SwarmEvent): Promise<void> {
    console.log(`[${this.agentId}] Processing event: ${event.type}`, event.payload);

    switch (event.type) {
      case 'scan_initiated':
        await this.handleScanInitiated(event);
        break;
      case 'mission_authorized':
        await this.handleMissionAuthorized(event);
        break;
      default:
        console.log(`[${this.agentId}] Unhandled event type: ${event.type}`);
    }
  }

  private async handleScanInitiated(event: SwarmEvent): Promise<void> {
    const { missionId, target, targetUrl, scanType } = event.payload as {
      missionId: string;
      target: string;
      targetUrl: string;
      scanType?: 'full' | 'delta' | 'targeted';
    };

    console.log(`[${this.agentId}] Starting recon for ${target} (${targetUrl}) scanType=${scanType || 'full'}`);

    const sessionId = `alpha-scan-${Date.now()}`;
    const useLlmPlanning = process.env.ALPHA_LLM_PLANNING === 'true';
    const state: AlphaScanState = {
      sessionId,
      target,
      targetUrl,
      missionId,
      phase: 'port_scan',
      iteration: 0,
      maxIterations: this.DEFAULT_MAX_ITERATIONS,
      discoveredEndpoints: new Set(),
      discoveredComponents: new Set(),
      discoveredPorts: new Set(),
      scanSessionActive: true,
      useLlmPlanning,
    };

    this.scanState.set(target, state);
    this.transitionTo('ACTIVE', 'scan started');

    try {
      await this.runScanLoop(target);
    } catch (error) {
      console.error(`[${this.agentId}] Scan failed for ${target}:`, error);
      await this.handleScanError(target, error);
    }
  }

  private async handleMissionAuthorized(event: SwarmEvent): Promise<void> {
    const { missionId, executor } = event.payload as {
      missionId: string;
      executor: string;
    };

    if (executor === 'alpha') {
      console.log(`[${this.agentId}] Alpha authorized for mission ${missionId}`);
    }
  }

  private async runScanLoop(target: string): Promise<void> {
    const state = this.scanState.get(target);
    if (!state) return;

    if (state.useLlmPlanning) {
      await this.runLlmPlanningLoop(state);
    } else {
      await this.runDeterministicScanLoop(target);
    }
  }

  private async runDeterministicScanLoop(target: string): Promise<void> {
    const state = this.scanState.get(target);
    if (!state) return;

    while (state.scanSessionActive && state.iteration < state.maxIterations && state.phase !== 'complete') {
      state.iteration++;
      console.log(`[${this.agentId}] Iteration ${state.iteration}/${state.maxIterations} - Phase: ${state.phase}`);

      switch (state.phase) {
        case 'port_scan':
          await this.executePortScan(state);
          break;
        case 'web_enum':
          await this.executeWebEnumeration(state);
          break;
        case 'tech_fingerprint':
          await this.executeTechFingerprint(state);
          break;
        case 'sast':
          await this.executeSastIfAvailable(state);
          break;
      }
    }

    if (state.phase === 'complete') {
      await this.completeScan(state.target);
    }
  }

  private async runLlmPlanningLoop(state: AlphaScanState): Promise<void> {
    const systemPrompt = loadAgentPrompt('alpha-recon');
    const targetContext = await this.pollMemoryForTarget(state.target, state.targetUrl);
    let contextBudget = 5000;
    let llmIterations = 0;
    const maxLlmIterations = 10;

    while (state.scanSessionActive && llmIterations < maxLlmIterations && state.phase !== 'complete') {
      llmIterations++;
      console.log(`[${this.agentId}] LLM Planning Iteration ${llmIterations}/${maxLlmIterations} - Phase: ${state.phase}`);

      const messages = this.buildLlmScanMessage(state, systemPrompt, targetContext);

      try {
        const response = await this.llmRouter.complete('alpha', messages);
        const parsed = this.parseLlmScanResponse(response);

        if (!parsed.tool || !parsed.command) {
          console.log(`[${this.agentId}] LLM did not return valid action, falling back to deterministic`);
          await this.runDeterministicScanLoop(state.target);
          break;
        }

        console.log(`[${this.agentId}] LLM decided: ${parsed.tool} ${parsed.command}`);
        const result = await this.executeTool(parsed.tool, this.parseToolArgs(parsed.tool, parsed.command));

        const findings = this.parseToolOutput(parsed.tool, result.stdout || result.stderr);
        for (const finding of findings) {
          await this.processFinding(state, finding);
        }

        contextBudget -= response.length;
        if (contextBudget <= 0) {
          console.log(`[${this.agentId}] Context budget exceeded, emitting scan_initiated with resume=true`);
          await this.emit('scan_initiated', {
            target: state.target,
            targetUrl: state.targetUrl,
            missionId: state.missionId,
            scanType: 'delta',
            resume: true,
          });
          break;
        }

        if (this.shouldTransitionPhase(state, parsed.tool)) {
          state.phase = this.getNextPhase(state.phase);
        }
      } catch (error) {
        console.error(`[${this.agentId}] LLM planning failed: ${error}, falling back to deterministic`);
        await this.runDeterministicScanLoop(state.target);
        break;
      }
    }

    if (state.phase === 'complete') {
      await this.completeScan(state.target);
    }
  }

  private parseLlmScanResponse(response: string): { tool?: string; command?: string; reasoning?: string } {
    const toolMatch = response.match(/<t>([a-z]+)<\/t>/);
    const cmdMatch = response.match(/<c>(.+?)<\/c>/);
    const reasonMatch = response.match(/<r>(.+?)<\/r>/);

    return {
      tool: toolMatch?.[1],
      command: cmdMatch?.[1],
      reasoning: reasonMatch?.[1],
    };
  }

  private parseToolArgs(tool: string, command: string): Record<string, unknown> {
    const args: Record<string, unknown> = { timeout: 60000 };

    if (tool === 'nmap') {
      const targetMatch = command.match(/(?:nmap\s+)?([\d.]+)/);
      const portMatch = command.match(/-p[:\s]+(\d+-?\d*)/);
      args.target = targetMatch?.[1] || this.scanState.get(this.agentId)?.target;
      if (portMatch) args.ports = portMatch[1];
    } else if (tool === 'ffuf' || tool === 'gobuster') {
      const urlMatch = command.match(/-u\s+([^\s]+)/);
      const wordlistMatch = command.match(/-w\s+([^\s]+)/);
      args.url = urlMatch?.[1];
      args.wordlist = wordlistMatch?.[1];
      args.flags = '-mc 200 -ml 100 -t 5';
    } else if (tool === 'curl') {
      const urlMatch = command.match(/curl[^\s]*\s+([^\s]+)/);
      args.url = urlMatch?.[1];
    } else if (tool === 'whatweb') {
      const urlMatch = command.match(/whatweb[^\s]*\s+([^\s]+)/);
      args.url = urlMatch?.[1];
    } else if (tool === 'nuclei') {
      const urlMatch = command.match(/-u\s+([^\s]+)/);
      args.target = urlMatch?.[1];
    }

    return args;
  }

  private shouldTransitionPhase(state: AlphaScanState, tool: string): boolean {
    if (state.phase === 'port_scan' && (tool === 'ffuf' || tool === 'gobuster' || tool === 'curl')) {
      return true;
    }
    if (state.phase === 'web_enum' && (tool === 'whatweb' || tool === 'nuclei')) {
      return true;
    }
    if (state.phase === 'tech_fingerprint' && tool === 'nuclei') {
      return true;
    }
    return false;
  }

  private getNextPhase(current: AlphaScanState['phase']): AlphaScanState['phase'] {
    switch (current) {
      case 'port_scan': return 'web_enum';
      case 'web_enum': return 'tech_fingerprint';
      case 'tech_fingerprint': return 'sast';
      case 'sast': return 'complete';
      default: return 'complete';
    }
  }

  private parseToolOutput(tool: string, output: string): Array<{ type: string; detail: string; evidence: string }> {
    const findings: Array<{ type: string; detail: string; evidence: string }> = [];

    if (tool === 'nmap') {
      const ports = output.match(/^(\d+)\/(tcp|udp)\s+open/g);
      if (ports) {
        for (const port of ports) {
          const match = port.match(/(\d+)\/(tcp|udp)/);
          if (match) {
            findings.push({
              type: 'port',
              detail: `Port ${match[1]} open`,
              evidence: port,
            });
          }
        }
      }
    } else if (tool === 'ffuf') {
      const endpoints = output.match(/^\s*(\/[^\s]+)\s+\[Status:/gm);
      if (endpoints) {
        for (const ep of endpoints) {
          const match = ep.match(/\/[^\s]+/);
          if (match) {
            findings.push({
              type: 'endpoint',
              detail: `Found endpoint ${match[0]}`,
              evidence: ep,
            });
          }
        }
      }
    } else if (tool === 'whatweb') {
      const techs = output.match(/^(.+?)\s+\[/gm);
      if (techs) {
        for (const tech of techs) {
          findings.push({
            type: 'component',
            detail: `Detected ${tech.trim()}`,
            evidence: tech,
          });
        }
      }
    }

    return findings;
  }

  private async processFinding(state: AlphaScanState, finding: { type: string; detail: string; evidence: string }): Promise<void> {
    if (finding.type === 'port') {
      const match = finding.evidence.match(/(\d+)\/(tcp|udp)/);
      if (match && !state.discoveredPorts.has(match[1]!)) {
        state.discoveredPorts.add(match[1]!);
        await this.writePortNode(state.target, match[1]!, state.missionId);
        await this.emit('port_discovered', {
          target_id: state.target,
          port: match[1]!,
          protocol: match[2]!,
          service: 'unknown',
          state: 'open',
        });
      }
    } else if (finding.type === 'endpoint') {
      const match = finding.evidence.match(/\/[^\s]+/);
      if (match && !state.discoveredEndpoints.has(match[0]!)) {
        state.discoveredEndpoints.add(match[0]!);
        await this.writeEndpointNode(state.target, match[0]!, 'llm_alpha', state.missionId);
        await this.emit('endpoint_discovered', {
          target_id: state.target,
          method: 'GET',
          path: match[0]!,
          discovered_by: 'llm_alpha',
        });
      }
    } else if (finding.type === 'component') {
      const name = finding.detail.replace(/Detected /, '').trim();
      const componentKey = `${name}:unknown`;
      if (!state.discoveredComponents.has(componentKey)) {
        state.discoveredComponents.add(componentKey);
        await this.writeComponentNode(state.target, name, 'unknown', state.missionId);
        await this.emit('component_detected', {
          target_id: state.target,
          component_name: name,
          version: 'unknown',
          component_type: 'framework',
        });
      }
    }
  }

  private async executePortScan(state: AlphaScanState): Promise<void> {
    console.log(`[${this.agentId}] Running port scan on ${state.target}`);

    const result = await this.executeTool('nmap', {
      target: state.target,
      ports: '1-10000',
      flags: '-sV --min-rate=1000',
      timeout: 60000,
    });

    if (result.success && result.stdout) {
      const ports = this.parseNmapOutput(result.stdout);
      for (const port of ports) {
        state.discoveredPorts.add(port);
        await this.writePortNode(state.target, port, state.missionId);
        await this.emit('port_discovered', {
          target_id: state.target,
          port: port,
          protocol: 'tcp',
          service: 'unknown',
          state: 'open',
        });
      }
      console.log(`[${this.agentId}] Found ${ports.length} open ports`);
    }

    state.phase = 'web_enum';
  }

  private async executeWebEnumeration(state: AlphaScanState): Promise<void> {
    console.log(`[${this.agentId}] Running web enumeration on ${state.targetUrl}`);

    const index = loadWordlistIndex();
    const wordlistEntry = index.stages.recon?.['raft-small-directories'];

    if (!wordlistEntry) {
      console.log(`[${this.agentId}] No wordlist available for recon`);
      state.phase = 'tech_fingerprint';
      return;
    }

    const wordlistPath = getWordlistPath(wordlistEntry.path);

    const ffufResult = await this.executeTool('ffuf', {
      url: state.targetUrl,
      wordlist: wordlistPath,
      flags: '-mc 200 -ml 100 -t 10',
      timeout: 180000,
    });

    if (ffufResult.success && ffufResult.stdout) {
      const endpoints = this.parseFfufOutput(ffufResult.stdout);
      for (const endpoint of endpoints) {
        if (!state.discoveredEndpoints.has(endpoint)) {
          state.discoveredEndpoints.add(endpoint);
          await this.writeEndpointNode(state.target, endpoint, 'ffuf', state.missionId);
          await this.emit('endpoint_discovered', {
            target_id: state.target,
            method: 'GET',
            path: endpoint,
            discovered_by: 'alpha',
          });
        }
      }
      console.log(`[${this.agentId}] Found ${endpoints.length} endpoints`);
    }

    const robotsResult = await this.executeTool('curl', {
      url: state.targetUrl + '/robots.txt',
      timeout: 10000,
    });

    if (robotsResult.success && robotsResult.stdout) {
      const robotsEndpoints = this.parseRobotsTxt(robotsResult.stdout);
      for (const endpoint of robotsEndpoints) {
        if (!state.discoveredEndpoints.has(endpoint)) {
          state.discoveredEndpoints.add(endpoint);
          await this.writeEndpointNode(state.target, endpoint, 'robots.txt', state.missionId);
          await this.emit('endpoint_discovered', {
            target_id: state.target,
            method: 'GET',
            path: endpoint,
            discovered_by: 'alpha',
          });
        }
      }
    }

    state.phase = 'tech_fingerprint';
  }

  private async executeTechFingerprint(state: AlphaScanState): Promise<void> {
    console.log(`[${this.agentId}] Running technology fingerprinting on ${state.targetUrl}`);

    const curlResult = await this.executeTool('curl', {
      url: state.targetUrl,
      timeout: 10000,
    });

    if (curlResult.success) {
      const headers = curlResult.stderr || '';
      const tech = this.detectTechFromResponse(curlResult.stdout, headers);

      for (const [name, version] of Object.entries(tech)) {
        const componentKey = `${name}:${version || 'unknown'}`;
        if (!state.discoveredComponents.has(componentKey)) {
          state.discoveredComponents.add(componentKey);
          await this.writeComponentNode(state.target, name, version || 'unknown', state.missionId);
          await this.emit('component_detected', {
            target_id: state.target,
            component_name: name,
            version: version || 'unknown',
            component_type: 'framework',
          });
        }
      }
    }

    const whatwebResult = await this.executeTool('whatweb', {
      url: state.targetUrl,
      timeout: 30000,
    });

    if (whatwebResult.success && whatwebResult.stdout) {
      const additionalTech = this.parseWhatWebOutput(whatwebResult.stdout);
      for (const [name, version] of Object.entries(additionalTech)) {
        const componentKey = `${name}:${version || 'unknown'}`;
        if (!state.discoveredComponents.has(componentKey)) {
          state.discoveredComponents.add(componentKey);
          await this.writeComponentNode(state.target, name, version || 'unknown', state.missionId);
        }
      }
    }

    state.phase = 'sast';
  }

  private async executeSastIfAvailable(state: AlphaScanState): Promise<void> {
    const repoPath = process.env.REPO_PATH;

    if (!repoPath) {
      console.log(`[${this.agentId}] No repo_path provided, skipping SAST`);
      state.phase = 'complete';
      return;
    }

    console.log(`[${this.agentId}] Running SAST scan on ${repoPath}`);

    const nucleiResult = await this.executeTool('nuclei', {
      target: state.targetUrl,
      templates: ['/usr/share/nuclei-templates'],
      timeout: 120000,
    });

    if (nucleiResult.success && nucleiResult.stdout) {
      const findings = this.parseNucleiOutput(nucleiResult.stdout);
      for (const finding of findings) {
        await this.writeSastFinding(state.target, finding, state.missionId);
        await this.emit('finding_written', {
          target_id: state.target,
          finding_type: 'sast_candidate',
          evidence: finding,
          source: 'alpha',
        });
      }
      console.log(`[${this.agentId}] Found ${findings.length} SAST candidates`);
    }

    state.phase = 'complete';
  }

  private async completeScan(target: string): Promise<void> {
    const state = this.scanState.get(target);
    if (!state) return;

    console.log(`[${this.agentId}] Scan complete for ${target}:
  - Ports: ${state.discoveredPorts.size}
  - Endpoints: ${state.discoveredEndpoints.size}
  - Components: ${state.discoveredComponents.size}`);

    await this.emit('recon_complete', {
      target_id: target,
      scan_type: 'full',
      ports_found: state.discoveredPorts.size,
      endpoints_found: state.discoveredEndpoints.size,
      components_found: state.discoveredComponents.size,
      duration_ms: Date.now(),
    });

    this.scanState.delete(target);
    this.transitionTo('COOLDOWN', 'scan complete');
  }

  private async handleScanError(target: string, error: unknown): Promise<void> {
    const state = this.scanState.get(target);
    if (!state) return;

    await this.emit('recon_complete', {
      target_id: target,
      scan_type: 'full',
      status: 'failed',
      error: String(error),
    });

    this.scanState.delete(target);
    this.transitionTo('ERROR', String(error));
  }

  private parseNmapOutput(output: string): string[] {
    const ports: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\d+)\/(tcp|udp)\s+/);
      if (match) {
        ports.push(match[1]!);
      }
    }

    return [...new Set(ports)];
  }

  private parseFfufOutput(output: string): string[] {
    const endpoints: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/^\s*(\/[^\s]+)\s+\[Status:/);
      if (match) {
        endpoints.push(match[1]!);
      }
    }

    return [...new Set(endpoints)];
  }

  private parseRobotsTxt(content: string): string[] {
    const endpoints: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^(?:Disallow|Allow):\s*(.+)/i);
      if (match) {
        const path = match[1]!.trim();
        if (path && path !== '/' && !path.includes('*')) {
          endpoints.push(path);
        }
      }
    }

    return [...new Set(endpoints)];
  }

  private detectTechFromResponse(html: string, headers: string): Record<string, string | undefined> {
    const tech: Record<string, string | undefined> = {};

    if (headers.includes('Express') || html.includes('node_modules')) {
      tech['Express'] = undefined;
    }
    if (headers.includes('X-Powered-By')) {
      const match = headers.match(/X-Powered-By:\s*(.+)/i);
      if (match) tech['Node.js'] = match[1]!.trim();
    }
    if (html.includes('Angular')) {
      tech['Angular'] = undefined;
    }
    if (html.includes('React') || html.includes('_NEXT_DATA_')) {
      tech['Next.js'] = undefined;
    }
    if (html.includes('vue')) {
      tech['Vue.js'] = undefined;
    }
    if (html.includes('django') || html.includes('django-csrftoken')) {
      tech['Django'] = undefined;
    }
    if (html.includes('laravel_session') || html.includes('laravel')) {
      tech['Laravel'] = undefined;
    }
    if (headers.includes('Server: Apache')) {
      tech['Apache'] = undefined;
    }
    if (headers.includes('Server: nginx')) {
      tech['Nginx'] = undefined;
    }

    return tech;
  }

  private parseWhatWebOutput(output: string): Record<string, string | undefined> {
    const tech: Record<string, string | undefined> = {};
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/^(.+?)\s+\[(\d+)\]$/);
      if (match) {
        tech[match[1]!.trim()] = match[2]!.trim();
      }
    }

    return tech;
  }

  private parseNucleiOutput(output: string): string[] {
    const findings: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('[infot')) {
        const match = line.match(/\[infotamation\]\s+(.+)/);
        if (match) {
          findings.push(match[1]!.trim());
        }
      }
    }

    return findings;
  }

  private async writePortNode(target: string, port: string, missionId: string): Promise<void> {
    const nodeId = sectionNodeId('recon', `port:${target}:${port}`);

    await this.graph.upsertNode({
      id: nodeId,
      type: 'recon',
      label: 'PortNode',
      target,
      port: parseInt(port),
      protocol: 'tcp',
      state: 'open',
      discovered_by: 'alpha',
      mission_id: missionId,
      discovered_at: Date.now(),
    });
  }

  private async writeEndpointNode(target: string, path: string, discoveredBy: string, missionId: string): Promise<void> {
    const nodeId = sectionNodeId('recon', `endpoint:${target}:${path}`);

    await this.graph.upsertNode({
      id: nodeId,
      type: 'recon',
      label: 'EndpointNode',
      target,
      path,
      url: `${target}${path}`,
      method: 'GET',
      discovered_by: discoveredBy,
      mission_id: missionId,
      discovered_at: Date.now(),
    });
  }

  private async writeComponentNode(target: string, name: string, version: string, missionId: string): Promise<void> {
    const nodeId = sectionNodeId('recon', `component:${target}:${name}`);

    await this.graph.upsertNode({
      id: nodeId,
      type: 'recon',
      label: 'ComponentNode',
      target,
      name,
      version,
      discovered_by: 'alpha',
      mission_id: missionId,
      discovered_at: Date.now(),
    });
  }

  private async writeSastFinding(target: string, evidence: string, missionId: string): Promise<void> {
    const findingId = `sast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nodeId = sectionNodeId('recon', findingId);

    await this.graph.upsertNode({
      id: nodeId,
      type: 'recon',
      label: 'FindingNode',
      target,
      evidence,
      source: 'alpha+sast',
      mission_id: missionId,
      discovered_at: Date.now(),
    });
  }

  private async pollMemoryForTarget(target: string, targetUrl: string): Promise<string> {
    const now = Date.now();
    if (now - this.lastMemoryPoll < this.MEMORY_POLL_INTERVAL_MS && this.lastMemoryPoll > 0) {
      console.log(`[${this.agentId}] Skipping memory poll - polled recently`);
      return '';
    }

    this.lastMemoryPoll = now;
    console.log(`[${this.agentId}] Polling memory for ${target}...`);

    let context = '\n\n## Known Intelligence (from FalkorDB):\n';

    try {
      const componentNodes = await this.graph.findNodesByLabel<Record<string, unknown>>('ComponentNode', { target });
      if (componentNodes.length > 0) {
        context += '\n### Known Components:\n';
        for (const c of componentNodes.slice(0, 5)) {
          context += `- ${c.name} (${c.version})\n`;
        }
      }

      const endpointNodes = await this.graph.findNodesByLabel<Record<string, unknown>>('EndpointNode', { target });
      if (endpointNodes.length > 0) {
        context += '\n### Known Endpoints:\n';
        for (const e of endpointNodes.slice(0, 10)) {
          context += `- ${e.method} ${e.path}\n`;
        }
      }

      const portNodes = await this.graph.findNodesByLabel<Record<string, unknown>>('PortNode', { target });
      if (portNodes.length > 0) {
        context += '\n### Known Ports:\n';
        for (const p of portNodes) {
          context += `- ${p.port} (${p.protocol})\n`;
        }
      }

      const intelNodes = await this.graph.findNodesByLabel<Record<string, unknown>>('IntelNode', {});
      if (intelNodes.length > 0) {
        context += '\n### Relevant CVEs:\n';
        for (const i of intelNodes.slice(0, 5)) {
          context += `- ${i.id}: ${i.name}\n`;
        }
      }
    } catch (e) {
      console.log(`[${this.agentId}] Error polling graph memory: ${e}`);
    }

    if (targetUrl.includes('juice') || target.includes('juice') || targetUrl.includes('127.0.0.1:3000')) {
      context += await this.pollSupabaseVulnerabilities();
    }

    if (context.includes('Known') || context.includes('CVE')) {
      console.log(`[${this.agentId}] Loaded memory context (${context.length} chars)`);
      return context;
    }

    return '';
  }

  private async pollSupabaseVulnerabilities(): Promise<string> {
    let context = '\n\n## Known Vulnerabilities (from Supabase - Juice Shop):\n';

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL || 'https://nesjaodrrkefpmqdqtgv.supabase.co';
      const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lc2phb2RycmtlZnBtcWRxdGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTg0MjcsImV4cCI6MjA4NjY5NDQyN30.zbEAwOcZ7Tn-LVfGC8KdQeh3D3xEyzghZ-Mfg0VgnfE';
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: vulnerabilities, error } = await supabase
        .from('vulnerabilities')
        .select('type, severity, category, title, file_path, line_start, confirmed, confidence_score')
        .limit(1000);

      if (error) {
        console.log(`[${this.agentId}] Supabase query error: ${error.message}`);
        return '';
      }

      if (vulnerabilities && vulnerabilities.length > 0) {
        const dedupMap = new Map<string, typeof vulnerabilities[0]>();
        
        for (const v of vulnerabilities) {
          const normalizedPath = this.extractNormalizedPath(v.file_path || '');
          const key = `${normalizedPath}|${v.type}|${v.line_start}`;
          if (!dedupMap.has(key)) {
            dedupMap.set(key, v);
          }
        }
        const uniqueVulns = Array.from(dedupMap.values());

        const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

        const findingsMap = new Map<string, typeof uniqueVulns[0]>();
        for (const v of uniqueVulns) {
          const normalizedPath = this.extractNormalizedPath(v.file_path || '');
          const dedupKey = `${normalizedPath}|${v.type}|${v.line_start}`;
          const existing = findingsMap.get(dedupKey);

          if (existing) {
            const existingSev = severityOrder[existing.severity || 'low'] || 0;
            const newSev = severityOrder[v.severity || 'low'] || 0;
            if (newSev > existingSev) {
              findingsMap.set(dedupKey, v);
            }
          } else {
            findingsMap.set(dedupKey, v);
          }
        }

        const finalVulns = Array.from(findingsMap.values());

        const existingNodes = await this.graph.findNodesByLabel<Record<string, unknown>>('IntelNode', { subtype: 'supabase_vuln' });
        const existingKeys = new Set(existingNodes.map(n => {
          const existingFile = n.file_path as string || '';
          return `${this.extractNormalizedPath(existingFile)}|${n.vuln_type}|${n.line_start}`;
        }));

        let newCount = 0;
        for (const v of finalVulns) {
          const normalizedPath = this.extractNormalizedPath(v.file_path || '');
          const key = `${normalizedPath}|${v.type}|${v.line_start}`;
          
          if (!existingKeys.has(key)) {
            const nodeId = sectionNodeId('intel', `vuln:${v.type}:${normalizedPath.replace(/\//g, ':')}:${v.line_start}`);
            await this.graph.upsertNode({
              id: nodeId,
              type: 'intel',
              label: 'IntelNode',
              subtype: 'supabase_vuln',
              vuln_type: v.type,
              severity: v.severity,
              file_path: v.file_path,
              normalized_path: normalizedPath,
              line_start: v.line_start,
              title: v.title,
              confirmed: v.confirmed || false,
              confidence: v.confidence_score,
              created_at: Date.now(),
            });
            newCount++;
          }
        }

        if (newCount > 0) {
          console.log(`[${this.agentId}] Wrote ${newCount} new vulnerabilities to graph`);
        } else {
          console.log(`[${this.agentId}] All ${finalVulns.length} vulnerabilities already exist in graph`);
        }

        const byType: Record<string, { path: string; severity: string; line: number }[]> = {};
        for (const v of finalVulns) {
          if (!byType[v.type]) byType[v.type] = [];
          byType[v.type]!.push({ path: this.extractNormalizedPath(v.file_path || ''), severity: v.severity || 'low', line: v.line_start || 0 });
        }

        context += `\nTotal: ${vulnerabilities.length} raw → ${finalVulns.length} unique (deduped by path+type+line)\n\n`;
        for (const [type, entries] of Object.entries(byType)) {
          const topEntries = entries.slice(0, 5);
          context += `### ${type} (${entries.length})\n`;
          for (const e of topEntries) {
            context += `  - ${e.path}:${e.line} [${e.severity}]\n`;
          }
          if (entries.length > 5) {
            context += `  ... and ${entries.length - 5} more\n`;
          }
        }
      }
    } catch (e) {
      console.log(`[${this.agentId}] Error fetching Supabase data: ${e}`);
    }

    return context;
  }

  private extractNormalizedPath(filePath: string): string {
    if (!filePath) return 'unknown';
    
    const parts = filePath.replace(/\\/g, '/').split('/');
    const routesIdx = parts.findIndex(p => p === 'routes');
    if (routesIdx >= 0 && parts[routesIdx + 1]) {
      return parts.slice(routesIdx).join('/');
    }
    
    const vulnIdx = parts.findIndex(p => p === 'vulnerabilities' || p === 'vulnCodeSnippet');
    if (vulnIdx >= 0 && parts[vulnIdx + 1]) {
      return parts.slice(vulnIdx).join('/');
    }
    
    return parts.pop() || 'unknown';
  }

  private buildLlmScanMessage(state: AlphaScanState, systemPrompt: string, targetContext: string = ''): LLMMessage[] {
    const context = `
Target: ${state.target}
Base URL: ${state.targetUrl}
Mission ID: ${state.missionId}
Current Phase: ${state.phase}
Iteration: ${state.iteration}

Discovered Ports: ${Array.from(state.discoveredPorts).join(', ') || 'none'}
Discovered Endpoints: ${Array.from(state.discoveredEndpoints).join(', ') || 'none'}
Discovered Components: ${Array.from(state.discoveredComponents).join(', ') || 'none'}
${targetContext}
`.trim();

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: context },
    ];
  }
}
