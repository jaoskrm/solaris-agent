import { BaseAgent, type AgentConfig } from './base-agent.js';
import type { SwarmEvent, SwarmEventType } from '../events/types.js';
import { sectionNodeId } from '../infra/falkordb.js';
import { loadWordlistIndex, getWordlistPath } from '../utils/wordlist-index.js';
import { LLMRouter } from '../core/llm-router.js';
import type { LLMMessage } from '../core/providers/ollama.js';
import { loadAgentPrompt } from '../utils/prompt-loader.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface TargetConfig {
  spaFallbackSize: number;
  isJuiceShop: boolean;
  seedProbes: string[];
}

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
  targetConfig: TargetConfig;
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
  private supabase: SupabaseClient;
  private llmSessionId: string | null = null;
  private llmIterationCounter = 0;

  constructor(config: AlphaConfig) {
    super(config);
    this.llmRouter = new LLMRouter();
    this.supabase = createClient(
      process.env.SUPABASE_URL || 'https://nesjaodrrkefpmqdqtgv.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lc2phb2RycmtlZnBtcWRxdGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTg0MjcsImV4cCI6MjA4NjY5NDQyN30.zbEAwOcZ7Tn-LVfGC8KdQeh3D3xEyzghZ-Mfg0VgnfE'
    );
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
    const isJuiceShop = targetUrl.includes('3000') || target.includes('juice');
    const targetConfig: TargetConfig = {
      spaFallbackSize: 0,
      isJuiceShop,
      seedProbes: isJuiceShop
        ? ['/api', '/rest', '/ftp', '/metrics', '/socket.io', '/api-doc']
        : [],
    };
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
      targetConfig,
    };

    this.scanState.set(target, state);
    this.transitionTo('ACTIVE', 'scan started');

    if (useLlmPlanning) {
      await this.createLlmSession(state);
    }

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
    let contextBudget = 8000;
    let llmIterations = 0;
    const maxLlmIterations = 15;
    let maxRetries = 1;
    
    // Measure SPA fallback size for Juice Shop targets BEFORE LLM loop starts
    if (state.targetConfig.isJuiceShop && !state.targetConfig.spaFallbackSize) {
      const fallbackSize = await this.measureSpaFallbackSize(state.targetUrl);
      state.targetConfig.spaFallbackSize = fallbackSize;
      console.log(`[${this.agentId}] Juice Shop SPA fallback size: ${fallbackSize}`);
    }
    
    // Conversation history for multi-turn LLM interaction
    const conversationHistory: LLMMessage[] = [];
    
    // Loop detector - track recent commands and tool failures
    const recentCommands: string[] = [];
    const toolFailureCount: Map<string, number> = new Map();
    const bannedTools: Set<string> = new Set();

    while (state.scanSessionActive && llmIterations < maxLlmIterations && state.phase !== 'complete') {
      llmIterations++;
      console.log(`[${this.agentId}] LLM Planning Iteration ${llmIterations}/${maxLlmIterations} - Phase: ${state.phase}`);

      const messages = this.buildLlmScanMessage(state, systemPrompt, targetContext, conversationHistory);

      try {
        const response = await this.llmRouter.complete('alpha', messages);
        
        console.log(`[${this.agentId}] LLM RAW OUTPUT:\n${'='.repeat(60)}\n${response}\n${'='.repeat(60)}`);
        
        // Validate LLM output format
        const parsed = this.parseLlmScanResponse(response);
        
        if (!parsed.tool || !parsed.command) {
          console.log(`[${this.agentId}] LLM returned malformed output, retrying...`);
          maxRetries--;
          if (maxRetries <= 0) {
            console.log(`[${this.agentId}] Max retries exceeded, falling back to deterministic`);
            await this.runDeterministicScanLoop(state.target);
            break;
          }
          // Feed back the malformed output and ask LLM to fix it
          conversationHistory.push({ role: 'assistant', content: response });
          conversationHistory.push({ 
            role: 'user', 
            content: `Your previous output was malformed. Please respond with ONLY valid XML tags:\n<reasoning>...</reasoning>\n<tool>...</tool>\n<command>...</command>\n\nCurrent state:\n- Phase: ${state.phase}\n- Discovered Ports: ${Array.from(state.discoveredPorts).join(', ') || 'none'}\n- Discovered Endpoints: ${Array.from(state.discoveredEndpoints).join(', ') || 'none'}` 
          });
          continue;
        }

        // STRICT TOOL WHITELIST - block hallucinated tools
        const VALID_TOOLS = new Set(['nmap', 'ffuf', 'curl', 'whatweb', 'nuclei']);
        if (!VALID_TOOLS.has(parsed.tool)) {
          console.log(`[${this.agentId}] BLOCKED invalid tool: ${parsed.tool}`);
          conversationHistory.push({ role: 'assistant', content: response });
          conversationHistory.push({ 
            role: 'user', 
            content: `INVALID TOOL: "${parsed.tool}". You MUST use only these tools: nmap, ffuf, curl, whatweb, nuclei\n\nUse ffuf to enumerate endpoints:\nffuf -u http://127.0.0.1:3000/FUZZ -w /home/peburu/wordlists/recon/directories/raft-small-directories.txt -fs 75002 -t 5 -rate 20 -timeout 10 -s` 
          });
          continue;
        }

        maxRetries = 2; // Reset retries on success
        console.log(`[${this.agentId}] LLM reasoning: ${parsed.reasoning?.substring(0, 100) || 'N/A'}...`);
        console.log(`[${this.agentId}] LLM decided: ${parsed.tool} ${parsed.command}`);
        
        // DISABLED: Allow all tools - agent has freedom to explore
        // if (bannedTools.has(parsed.tool!)) {
        //   console.log(`[${this.agentId}] Tool ${parsed.tool} is banned, forcing tool switch`);
        //   conversationHistory.push({ role: 'assistant', content: response });
        //   conversationHistory.push({
        //     role: 'user',
        //     content: `BANNED: Do not use ${parsed.tool} again this session. It has failed multiple times. Use a DIFFERENT tool (curl, whatweb, or nuclei) or skip to the next phase.`
        //   });
        //   continue;
        // }
        
        // DISABLED: Loop detector - allow agent to explore freely
        // const normalizedCmd = `${parsed.tool} ${parsed.command}`.replace(/\s+/g, ' ').trim();
        // if (recentCommands.slice(-3).includes(normalizedCmd)) {
        //   console.log(`[${this.agentId}] Loop detected for command: ${normalizedCmd}`);
        //   conversationHistory.push({ role: 'assistant', content: response });
        //   conversationHistory.push({
        //     role: 'user',
        //     content: `WARNING: You just tried the exact same command and it failed. Use a DIFFERENT tool or approach. If gobuster/ffuf fails, try curl instead or skip to next phase.`
        //   });
        //   continue;
        // }
        // recentCommands.push(normalizedCmd);
        
        // Increment iteration counter for this LLM turn
        this.llmIterationCounter++;
        
        // Add LLM decision to conversation history
        conversationHistory.push({ role: 'assistant', content: response });
        
        // Store LLM decision in Supabase
        await this.storeLlmMessage({
          iteration: this.llmIterationCounter,
          sequence: 1,
          role: 'assistant',
          content: response,
          toolName: parsed.tool,
          command: parsed.command,
          reasoning: parsed.reasoning,
        });

        // Execute tool - run the LLM's command EXACTLY as output in <c> tag
        // The <c> tag contains the complete command including tool name
        let fullCommand = parsed.command!.trim();
        
        // Expand ~ to home directory (shell doesn't expand ~ in quoted strings)
        fullCommand = fullCommand.replace(/^~/, '/home/peburu');
        
        // For ffuf, ensure gentle flags to avoid crashing Juice Shop
        if (parsed.tool === 'ffuf' && state.targetConfig.isJuiceShop) {
          // Replace aggressive flags with gentle ones
          fullCommand = fullCommand
            .replace(/-t\s*\d+/g, '-t 5')
            .replace(/-rate\s*\d+/g, '-rate 20')
            .replace(/-timeout\s*\d+/g, '-timeout 10');
          
          // Ensure -fs flag for SPA filtering if missing
          if (!fullCommand.includes('-fs ') && state.targetConfig.spaFallbackSize > 0) {
            fullCommand = fullCommand.replace('-s', `-fs ${state.targetConfig.spaFallbackSize} -s`);
          }
        }
        
        console.log(`[${this.agentId}] Executing: ${fullCommand}`);
        
        const startTime = Date.now();
        const result = await this.executeCommand(fullCommand);
        const durationMs = Date.now() - startTime;
        
        let toolOutput = result.stdout || result.stderr || '';
        
        // Detect HTML SPA bleed for HTTP probing tools only (curl, ffuf, whatweb)
        const httpTools = ['curl', 'ffuf', 'wget', 'whatweb'];
        const isHtmlRedirect = httpTools.includes(parsed.tool!) && 
          (toolOutput.startsWith('<!DOCTYPE') || (toolOutput.length > 500 && /<html/i.test(toolOutput)));
        if (isHtmlRedirect) {
          toolOutput = '[HTML_REDIRECT] This URL returns the SPA index page, not a file. Skip this endpoint.';
        }
        
        // Cap output at 3000 chars to prevent context bomb
        const MAX_OUTPUT = 3000;
        const outputPreview = toolOutput.length > MAX_OUTPUT 
          ? toolOutput.substring(0, MAX_OUTPUT) + '...[truncated]'
          : toolOutput;
        
        console.log(`[${this.agentId}] Tool result: success=${result.success}, exit=${result.exit_code}, output_len=${toolOutput.length}, html_redirect=${isHtmlRedirect}`);
        console.log(`[${this.agentId}] Tool output preview: ${outputPreview.substring(0, 300)}`);
        
        // DISABLED: Tool failure tracking - allow agent to experiment
        // if (!result.success) {
        //   const failKey = `${parsed.tool}:${state.phase}`;
        //   const fails = (toolFailureCount.get(failKey) || 0) + 1;
        //   toolFailureCount.set(failKey, fails);
        //   console.log(`[${this.agentId}] Tool ${parsed.tool} failed ${fails} time(s) in phase ${state.phase}`);
        //   
        //   if (fails >= 2) {
        //     bannedTools.add(parsed.tool!);
        //     console.log(`[${this.agentId}] BANNING tool ${parsed.tool} for session`);
        //     conversationHistory.push({
        //       role: 'user',
        //       content: `BANNED: Do not use ${parsed.tool} again. It has failed ${fails} times. Use a DIFFERENT tool or skip to the next phase.`
        //     });
        //   }
        // }
        
        // Also parse findings and update state
        const fallbackSize = state.targetConfig.spaFallbackSize || await this.measureSpaFallbackSize(state.targetUrl);
        if (!state.targetConfig.spaFallbackSize) {
          state.targetConfig.spaFallbackSize = fallbackSize;
        }
        const findings = this.parseToolOutput(parsed.tool, toolOutput, fallbackSize);
        const portsFound: string[] = [];
        const endpointsFound: string[] = [];
        const componentsFound: string[] = [];
        
        // Force port 3000 for Juice Shop even if nmap parse fails
        if (parsed.tool === 'nmap' && state.targetConfig.isJuiceShop && !state.discoveredPorts.has('3000')) {
          console.log(`[${this.agentId}] FORCE writing port 3000 for Juice Shop`);
          await this.processFinding(state, {
            type: 'port',
            detail: 'Port 3000 open (http)',
            evidence: '3000/tcp open http',
          });
        }
        
        for (const finding of findings) {
          await this.processFinding(state, finding);
          
          // Track findings and store to Supabase
          if (finding.type === 'port') {
            const portMatch = finding.evidence.match(/(\d+)/);
            if (portMatch) {
              portsFound.push(portMatch[1]!);
              await this.storeDiscovery({
                discoveryType: 'port',
                identifier: portMatch[1]!,
                detail: finding.detail,
                evidence: finding.evidence,
                sourceTool: parsed.tool!,
                iterationDiscovered: this.llmIterationCounter,
              });
            }
          } else if (finding.type === 'endpoint') {
            const pathMatch = finding.detail.match(/Found endpoint (\S+)/);
            if (pathMatch) {
              endpointsFound.push(pathMatch[1]!);
              await this.storeDiscovery({
                discoveryType: 'endpoint',
                identifier: pathMatch[1]!,
                detail: finding.detail,
                evidence: finding.evidence,
                sourceTool: parsed.tool!,
                iterationDiscovered: this.llmIterationCounter,
              });
            }
          } else if (finding.type === 'component') {
            const compMatch = finding.detail.match(/Detected (.+)/);
            if (compMatch) {
              componentsFound.push(compMatch[1]!.trim());
              await this.storeDiscovery({
                discoveryType: 'component',
                identifier: compMatch[1]!.trim(),
                detail: finding.detail,
                evidence: finding.evidence,
                sourceTool: parsed.tool!,
                iterationDiscovered: this.llmIterationCounter,
              });
            }
          }
        }
        
        // Store tool execution in Supabase
        await this.storeToolExecution({
          iteration: this.llmIterationCounter,
          toolName: parsed.tool!,
          command: parsed.command!,
          args: { raw: parsed.command },
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          exitCode: result.exit_code || 0,
          timedOut: result.timed_out || false,
          success: result.success || false,
          durationMs,
          portsDiscovered: portsFound,
          endpointsDiscovered: endpointsFound,
          componentsDiscovered: componentsFound,
        });
        
        // Build a summary of what was discovered
        let discoverySummary = '';
        if (state.discoveredPorts.size > 0) {
          discoverySummary += `\nDISCOVERED PORTS: ${Array.from(state.discoveredPorts).join(', ')}`;
        }
        if (state.discoveredEndpoints.size > 0) {
          discoverySummary += `\nDISCOVERED ENDPOINTS (${state.discoveredEndpoints.size}): ${Array.from(state.discoveredEndpoints).slice(0, 30).join(', ')}${state.discoveredEndpoints.size > 30 ? '...' : ''}`;
        }
        if (state.discoveredComponents.size > 0) {
          discoverySummary += `\nDISCOVERED COMPONENTS: ${Array.from(state.discoveredComponents).join(', ')}`;
        }
        
        // For ffuf, explicitly tell LLM about parsed endpoints
        if (parsed.tool === 'ffuf' && endpointsFound.length > 0) {
          discoverySummary += `\nFFUF FOUND ${endpointsFound.length} ENDPOINTS: ${endpointsFound.slice(0, 20).join(', ')}${endpointsFound.length > 20 ? '...' : ''}`;
        }
        
        // Feed tool output back to LLM for analysis
        conversationHistory.push({ 
          role: 'user', 
          content: `Tool execution complete:

STDOUT:
${outputPreview}

EXIT CODE: ${result.exit_code}
TIMED OUT: ${result.timed_out}
SUCCESS: ${result.success}${discoverySummary}

Analyze the output. What was discovered? What should we do next?` 
        });

        // Check if LLM indicates done
        if (response.includes('<done>true</done>') || response.includes('<done>1</done>')) {
          console.log(`[${this.agentId}] LLM indicated scan complete`);
          state.phase = 'complete';
          break;
        }

        // Update context budget
        contextBudget -= response.length + outputPreview.length;
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

        // Transition phases based on tool results and LLM analysis
        if (this.shouldTransitionPhase(state, parsed.tool)) {
          const nextPhase = this.getNextPhase(state.phase);
          console.log(`[${this.agentId}] Transitioning from ${state.phase} to ${nextPhase}`);
          state.phase = nextPhase;
        }
        
        // Add phase transition to conversation context for next iteration
        conversationHistory.push({ 
          role: 'user', 
          content: `Phase note: Now in ${state.phase} phase.` 
        });
        
      } catch (error) {
        console.error(`[${this.agentId}] LLM planning failed: ${error}, falling back to deterministic`);
        if (state.useLlmPlanning) {
          await this.updateLlmSessionStatus('failed', String(error));
        }
        await this.runDeterministicScanLoop(state.target);
        break;
      }
    }

    if (state.phase === 'complete') {
      await this.completeScan(state.target);
    }
  }

  private parseLlmScanResponse(response: string): { tool?: string; command?: string; reasoning?: string } {
    const toolMatch = response.match(/<(?:t|tool)>([^<]+)<\/(?:t|tool)>/i);
    const cmdMatch = response.match(/<(?:c|command)>([^<]+)<\/(?:c|command)>/i);
    const reasonMatch = response.match(/<(?:r|reasoning)>([^<]+)<\/(?:r|reasoning)>/i);

    return {
      tool: toolMatch?.[1]?.trim(),
      command: cmdMatch?.[1]?.trim(),
      reasoning: reasonMatch?.[1]?.trim(),
    };
  }

  private shouldTransitionPhase(state: AlphaScanState, tool: string): boolean {
    // Transition based on actual discoveries
    if (state.phase === 'port_scan' && state.discoveredPorts.size > 0) {
      return true;
    }
    if (state.phase === 'web_enum' && state.discoveredEndpoints.size > 0) {
      return true;
    }
    if (state.phase === 'tech_fingerprint' && state.discoveredComponents.size > 0) {
      return true;
    }
    // Also allow transition based on tool completion (fallback)
    if (state.phase === 'port_scan' && (tool === 'nmap' || tool === 'whatweb')) {
      return true;
    }
    if (state.phase === 'web_enum' && (tool === 'ffuf' || tool === 'curl')) {
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

  private parseToolOutput(tool: string, output: string, spaFallbackSize = 0): Array<{ type: string; detail: string; evidence: string }> {
    const findings: Array<{ type: string; detail: string; evidence: string }> = [];

    if (tool === 'nmap') {
      const portMatches = output.match(/(\d+)\/tcp\s+open\s+(\S+)/gi);
      if (portMatches) {
        for (const port of portMatches) {
          const match = port.match(/(\d+)\/tcp\s+open\s+(\S+)/i);
          if (match) {
            findings.push({
              type: 'port',
              detail: `Port ${match[1]} open (${match[2]})`,
              evidence: port,
            });
          }
        }
      }
    } else if (tool === 'ffuf') {
      const lines = output.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('::') && l.length < 100);
      console.log(`[${this.agentId}] ffuf parsed ${lines.length} potential endpoints`);
      
      // Only process first 50 to avoid context overflow
      const topLines = lines.slice(0, 50);
      for (const line of topLines) {
        const path = line.startsWith('/') ? line : `/${line}`;
        findings.push({
          type: 'endpoint',
          detail: `Found endpoint ${path}`,
          evidence: path,
        });
      }
      
      // Mark as success if we found any endpoints
      if (topLines.length > 0) {
        findings.push({
          type: 'ffuf_success',
          detail: `ffuf found ${lines.length} total endpoints, processed ${topLines.length}`,
          evidence: `ffuf hits: ${topLines.join(', ')}`,
        });
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

    // Scan common web ports first
    const commonPorts = '22,80,443,3000,3001,5000,8080,8443';
    const result = await this.executeTool('nmap', {
      target: state.target,
      ports: commonPorts,
      flags: '-sV',
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
    const spaFallbackSize = state.targetConfig.spaFallbackSize || await this.measureSpaFallbackSize(state.targetUrl);
    if (!state.targetConfig.spaFallbackSize) {
      state.targetConfig.spaFallbackSize = spaFallbackSize;
    }

    const ffufFlags = state.targetConfig.isJuiceShop
      ? `-fs ${spaFallbackSize} -t 5`
      : `-mc 200 -ml 100 -t 10`;

    const ffufResult = await this.executeTool('ffuf', {
      url: state.targetUrl + '/FUZZ',
      wordlist: wordlistPath,
      flags: ffufFlags,
      timeout: 180000,
    });

    if (ffufResult.success && ffufResult.stdout) {
      const ffufHits = this.parseFfufOutputWithSize(ffufResult.stdout, spaFallbackSize);
      for (const hit of ffufHits) {
        const normalized = this.normalizePath(hit.path);
        if (!state.discoveredEndpoints.has(normalized)) {
          const probe = await this.probeEndpoint(state.targetUrl, hit.path);
          state.discoveredEndpoints.add(normalized);
          await this.writeEndpointNode(state.target, normalized, 'ffuf', state.missionId, hit.path, probe.size, probe.bodyPreview);
          await this.emit('endpoint_discovered', {
            target_id: state.target,
            method: 'GET',
            path: normalized,
            original_path: hit.path,
            discovered_by: 'alpha',
            size: probe.size,
            body_preview: probe.bodyPreview,
          });
        }
      }
      console.log(`[${this.agentId}] ffuf found ${ffufHits.length} non-spa endpoints`);
    }

    const seedProbes = state.targetConfig.seedProbes;
    if (seedProbes.length > 0) {
      console.log(`[${this.agentId}] Probing ${seedProbes.length} seed endpoints...`);
      for (const probe of seedProbes) {
        const probeUrl = state.targetUrl + probe;
        const curlResult = await this.executeTool('curl', {
          url: probeUrl,
          timeout: 10000,
        });

        if (curlResult.success && curlResult.stdout) {
          const contentLength = curlResult.stdout.length;
          const isReal = spaFallbackSize === 0 || contentLength !== spaFallbackSize;
          const normalized = this.normalizePath(probe);

          if (isReal && !state.discoveredEndpoints.has(normalized)) {
            state.discoveredEndpoints.add(normalized);
            await this.writeEndpointNode(state.target, normalized, 'seed_probe', state.missionId);
            await this.emit('endpoint_discovered', {
              target_id: state.target,
              method: 'GET',
              path: normalized,
              original_path: probe,
              discovered_by: 'seed_probe',
              size: contentLength,
            });
            console.log(`[${this.agentId}] Seed probe found: ${probe} (size: ${contentLength})`);
          }
        }
      }
    }

    const robotsResult = await this.executeTool('curl', {
      url: state.targetUrl + '/robots.txt',
      timeout: 10000,
    });

    if (robotsResult.success && robotsResult.stdout) {
      const robotsEndpoints = this.parseRobotsTxt(robotsResult.stdout);
      for (const endpoint of robotsEndpoints) {
        const normalized = this.normalizePath(endpoint);
        if (!state.discoveredEndpoints.has(normalized)) {
          state.discoveredEndpoints.add(normalized);
          await this.writeEndpointNode(state.target, normalized, 'robots.txt', state.missionId);
          await this.emit('endpoint_discovered', {
            target_id: state.target,
            method: 'GET',
            path: normalized,
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

    if (state.useLlmPlanning) {
      await this.updateLlmSessionStatus('completed');
    }

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

    if (state.useLlmPlanning) {
      await this.updateLlmSessionStatus('failed', String(error));
    }

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

  private normalizePath(path: string): string {
    return path.toLowerCase().replace(/\/+$/, '');
  }

  private async measureSpaFallbackSize(targetUrl: string): Promise<number> {
    const result = await this.executeCommand(`curl -sI "${targetUrl}/" 2>/dev/null | grep -i content-length | awk '{print $2}' | tr -d '\\r'`);
    const size = parseInt(result.stdout?.trim() || '0', 10);
    console.log(`[${this.agentId}] SPA fallback size: ${size}`);
    return size;
  }

  private async ensureJuiceShopRunning(): Promise<void> {
    const healthCheck = await this.executeCommand('curl -sI http://127.0.0.1:3000/ 2>/dev/null | head -1');
    const isUp = healthCheck.stdout?.includes('200') || healthCheck.stdout?.includes('301') || healthCheck.stdout?.includes('302');
    
    if (!isUp) {
      console.log(`[${this.agentId}] Juice Shop not responding, restarting...`);
      await this.executeCommand('docker start juiceshop 2>&1');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify it's up
      const verify = await this.executeCommand('curl -sI http://127.0.0.1:3000/ 2>/dev/null | head -1');
      if (verify.stdout?.includes('200')) {
        console.log(`[${this.agentId}] Juice Shop is back up`);
      }
    }
  }

  private parseFfufOutputWithSize(output: string, spaFallbackSize: number): Array<{ path: string; size: number; raw: string }> {
    const seen = new Set<string>();
    const results: Array<{ path: string; size: number; raw: string }> = [];

    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip progress lines, empty output, or lines with special characters
      if (trimmed.startsWith('::') || trimmed.startsWith('Progress') || trimmed.includes('[')) continue;
      if (trimmed.length > 100) continue;
      
      const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
      const normalized = this.normalizePath(path);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      
      results.push({ path, size: 0, raw: line.trim() });
    }

    return results;
  }

  private async probeEndpoint(targetUrl: string, path: string): Promise<{ size: number; bodyPreview: string }> {
    const url = `${targetUrl}${path}`;
    const result = await this.executeTool('curl', {
      url,
      timeout: 10000,
    });

    const body = result.stdout || '';
    const size = body.length;
    const bodyPreview = body.substring(0, 500).replace(/[\n\r]+/g, ' ').trim();

    return { size, bodyPreview };
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

  private async writeEndpointNode(
    target: string,
    path: string,
    discoveredBy: string,
    missionId: string,
    originalPath?: string,
    size?: number,
    bodyPreview?: string
  ): Promise<void> {
    const nodeId = sectionNodeId('recon', `endpoint:${target}:${path}`);

    await this.graph.upsertNode({
      id: nodeId,
      type: 'recon',
      label: 'EndpointNode',
      target,
      path,
      original_path: originalPath || null,
      url: `${target}${path}`,
      method: 'GET',
      discovered_by: discoveredBy,
      mission_id: missionId,
      discovered_at: Date.now(),
      size: size || null,
      body_preview: bodyPreview || null,
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

  private buildLlmScanMessage(
    state: AlphaScanState, 
    systemPrompt: string, 
    targetContext: string = '',
    conversationHistory: LLMMessage[] = []
  ): LLMMessage[] {
    const isJuiceShop = state.targetUrl.includes('3000') || state.target.includes('juice');
    const fallbackSize = state.targetConfig.spaFallbackSize || 0;
    const juiceShopHint = isJuiceShop 
      ? `\n[TARGET INFO] This is OWASP Juice Shop running on port 3000. SPA fallback size: ${fallbackSize}. Use -fs ${fallbackSize} on ffuf commands.` 
      : '';
    
    const context = `
Target: ${state.target}
Base URL: ${state.targetUrl}
Mission ID: ${state.missionId}
Current Phase: ${state.phase}
Iteration: ${state.iteration}${juiceShopHint}

Discovered Ports: ${Array.from(state.discoveredPorts).join(', ') || 'none'}
Discovered Endpoints: ${Array.from(state.discoveredEndpoints).join(', ') || 'none'}
Discovered Components: ${Array.from(state.discoveredComponents).join(', ') || 'none'}
${targetContext}

Respond with XML tags only:
<reasoning>What I'm scanning and why</reasoning>
<tool>tool_name</tool>
<command>exact command to execute</command>
`.trim();

    // Build messages: system prompt first, then conversation history, then current context
    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];
    
    // Add conversation history (previous LLM outputs and tool results)
    messages.push(...conversationHistory);
    
    // Add current context if no history (first turn) or as a fresh prompt
    if (conversationHistory.length === 0) {
      messages.push({ role: 'user', content: context });
    } else {
      // Already have context in history, just add current state summary WITH format reminder
      const fallbackSize = state.targetConfig.spaFallbackSize || 0;
      const juiceShopLine = state.targetConfig.isJuiceShop ? `- SPA fallback size: ${fallbackSize} (use -fs ${fallbackSize} on ffuf)` : '';
      messages.push({ 
        role: 'user', 
        content: `Current state:
- Phase: ${state.phase}
- Ports: ${Array.from(state.discoveredPorts).join(', ') || 'none'}
- Endpoints: ${Array.from(state.discoveredEndpoints).join(', ') || 'none'}
- Components: ${Array.from(state.discoveredComponents).join(', ') || 'none'}
${juiceShopLine}

Based on the tool output above, decide next action.
Respond with XML tags:
<r>Analysis and next step</r>
<t>tool_name</t>
<c>command to execute</c>` 
      });
    }
    
    return messages;
  }

  private async createLlmSession(state: AlphaScanState): Promise<void> {
    if (!this.supabase) return;

    try {
      const { data, error } = await this.supabase
        .from('llm_sessions')
        .insert({
          agent_id: this.agentId,
          agent_type: 'alpha',
          target: state.target,
          target_url: state.targetUrl,
          mission_id: state.missionId,
          scan_type: 'full',
          status: 'active',
        })
        .select('id')
        .single();

      if (error) {
        console.error(`[${this.agentId}] Failed to create LLM session: ${error.message}`);
        return;
      }

      this.llmSessionId = data.id;
      this.llmIterationCounter = 0;
      console.log(`[${this.agentId}] Created LLM session: ${this.llmSessionId}`);
    } catch (e) {
      console.error(`[${this.agentId}] Error creating LLM session: ${e}`);
    }
  }

  private async storeLlmMessage(params: {
    iteration: number;
    sequence: number;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolName?: string;
    command?: string;
    reasoning?: string;
    toolOutput?: string;
    exitCode?: number;
    success?: boolean;
  }): Promise<void> {
    if (!this.supabase || !this.llmSessionId) return;

    try {
      const { error } = await this.supabase.from('llm_messages').insert({
        session_id: this.llmSessionId,
        iteration: params.iteration,
        sequence: params.sequence,
        role: params.role,
        content: params.content,
        tool_name: params.toolName,
        command: params.command,
        reasoning: params.reasoning,
        tool_output: params.toolOutput,
        exit_code: params.exitCode,
        success: params.success,
      });

      if (error) {
        console.error(`[${this.agentId}] Failed to store LLM message: ${error.message}`);
      }
    } catch (e) {
      console.error(`[${this.agentId}] Error storing LLM message: ${e}`);
    }
  }

  private async storeToolExecution(params: {
    iteration: number;
    toolName: string;
    command: string;
    args: Record<string, unknown>;
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
    success: boolean;
    durationMs: number;
    portsDiscovered: string[];
    endpointsDiscovered: string[];
    componentsDiscovered: string[];
  }): Promise<void> {
    if (!this.supabase || !this.llmSessionId) return;

    try {
      const findings = [];
      if (params.portsDiscovered.length > 0) {
        for (const port of params.portsDiscovered) {
          findings.push({ type: 'port', detail: `Port ${port} open`, evidence: `${port}/tcp open` });
        }
      }
      if (params.endpointsDiscovered.length > 0) {
        for (const endpoint of params.endpointsDiscovered) {
          findings.push({ type: 'endpoint', detail: `Found endpoint ${endpoint}`, evidence: endpoint });
        }
      }
      if (params.componentsDiscovered.length > 0) {
        for (const component of params.componentsDiscovered) {
          findings.push({ type: 'component', detail: component, evidence: component });
        }
      }

      const { error } = await this.supabase.from('llm_tool_executions').insert({
        session_id: this.llmSessionId,
        iteration: params.iteration,
        tool_name: params.toolName,
        command: params.command,
        args: params.args,
        stdout: params.stdout.substring(0, 50000),
        stderr: params.stderr.substring(0, 10000),
        exit_code: params.exitCode,
        timed_out: params.timedOut,
        success: params.success,
        duration_ms: params.durationMs,
        findings: findings.length > 0 ? findings : null,
        ports_discovered: params.portsDiscovered,
        endpoints_discovered: params.endpointsDiscovered,
        components_discovered: params.componentsDiscovered,
      });

      if (error) {
        console.error(`[${this.agentId}] Failed to store tool execution: ${error.message}`);
      }
    } catch (e) {
      console.error(`[${this.agentId}] Error storing tool execution: ${e}`);
    }
  }

  private async storeDiscovery(params: {
    discoveryType: 'port' | 'endpoint' | 'component' | 'vulnerability';
    identifier: string;
    detail: string;
    evidence: string;
    sourceTool: string;
    iterationDiscovered: number;
    graphNodeId?: string;
  }): Promise<void> {
    if (!this.supabase || !this.llmSessionId) return;

    try {
      const { error } = await this.supabase.from('llm_discoveries').insert({
        session_id: this.llmSessionId,
        discovery_type: params.discoveryType,
        identifier: params.identifier,
        detail: params.detail,
        evidence: params.evidence,
        source_tool: params.sourceTool,
        iteration_discovered: params.iterationDiscovered,
        graph_node_id: params.graphNodeId,
      });

      if (error) {
        console.error(`[${this.agentId}] Failed to store discovery: ${error.message}`);
      }
    } catch (e) {
      console.error(`[${this.agentId}] Error storing discovery: ${e}`);
    }
  }

  private async updateLlmSessionStatus(status: 'completed' | 'failed' | 'cancelled', errorMessage?: string): Promise<void> {
    if (!this.supabase || !this.llmSessionId) return;

    try {
      const { error } = await this.supabase
        .from('llm_sessions')
        .update({
          status,
          ended_at: new Date().toISOString(),
          total_iterations: this.llmIterationCounter,
          error_message: errorMessage,
        })
        .eq('id', this.llmSessionId);

      if (error) {
        console.error(`[${this.agentId}] Failed to update LLM session status: ${error.message}`);
      } else {
        console.log(`[${this.agentId}] Updated LLM session status to: ${status}`);
      }
    } catch (e) {
      console.error(`[${this.agentId}] Error updating LLM session status: ${e}`);
    }
  }
}
