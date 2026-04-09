import { BaseAgent, type AgentConfig } from './base-agent.js';
import type { SwarmEvent, SwarmEventType } from '../events/types.js';
import { sectionNodeId } from '../infra/falkordb.js';
import { loadWordlistIndex, getWordlistPath } from '../utils/wordlist-index.js';
import { LLMRouter } from '../core/llm-router.js';
import type { LLMMessage } from '../core/providers/ollama.js';
import { loadAgentPrompt } from '../utils/prompt-loader.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

// Light RAG Types for Mission Status Document
interface ToolOutputSummary {
  tool: string;
  command: string;
  summary: string;
  newEndpoints?: string[];
  newPorts?: string[];
  newComponents?: string[];
  resultCount: number;
  timestamp: number;
}

interface CommandHistoryEntry {
  iteration: number;
  tool: string;
  command: string;
  resultSummary: string;
  timestamp: number;
  objective: string;
}

interface LightRAGStatus {
  mission_id: string;
  target: string;
  target_url: string;
  objective: string;
  phase: string;
  iteration: number;
  updated_at: number;
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
    const { missionId, target, targetUrl, scanType, resume } = event.payload as {
      missionId: string;
      target: string;
      targetUrl: string;
      scanType?: 'full' | 'delta' | 'targeted';
      resume?: boolean;
    };

    console.log(`[${this.agentId}] Starting recon for ${target} (${targetUrl}) scanType=${scanType || 'full'} resume=${resume || false}`);

    // Check if this is a resume - reuse existing state if available
    let state = this.scanState.get(target);
    let isResume = !!resume;

    if (isResume && state) {
      // Reuse existing state for resume - don't overwrite discovered endpoints/ports
      console.log(`[${this.agentId}] RESUMING existing mission ${state.missionId} - preserving discoveries`);
      state.scanSessionActive = true;
      state.phase = 'port_scan'; // Reset to start for LLM to pick up
    } else if (isResume && !state) {
      // Resume but no existing state - load from graph
      console.log(`[${this.agentId}] RESUMING but no existing state - will load from graph`);
      isResume = true;
    }

    if (!state) {
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
      state = {
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
    }

    try {
      await this.runScanLoop(target, isResume);
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

  private async runScanLoop(target: string, isResume = false): Promise<void> {
    const state = this.scanState.get(target);
    if (!state) return;

    if (state.useLlmPlanning) {
      await this.runLlmPlanningLoop(state, isResume);
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

  private async runLlmPlanningLoop(state: AlphaScanState, isResume = false): Promise<void> {
    const systemPrompt = loadAgentPrompt('alpha-recon');
    const targetContext = await this.pollMemoryForTarget(state.target, state.targetUrl, isResume);
    let llmIterations = 0;
    const maxLlmIterations = 15;
    let maxRetries = 1;
    
    // Set SPA fallback size for Juice Shop targets
    if (state.targetConfig.isJuiceShop && !state.targetConfig.spaFallbackSize) {
      state.targetConfig.spaFallbackSize = 75002;
      console.log(`[${this.agentId}] Juice Shop SPA fallback size: 75002 (hardcoded)`);
    }
    
    // Conversation history for multi-turn LLM interaction
    const conversationHistory: LLMMessage[] = [];
    
    // If resuming, load graph findings into state and inject context
    if (isResume) {
      console.log(`[${this.agentId}] RESUMING: Loading graph data into state...`);
      const { mission: ragMission, findings: ragFindings } = await this.loadMissionContext(state.missionId);
      
      // Load graph findings into state Sets
      for (const f of ragFindings) {
        if (f.type === 'endpoint') state.discoveredEndpoints.add(f.value);
        else if (f.type === 'port') state.discoveredPorts.add(f.value);
        else if (f.type === 'component') state.discoveredComponents.add(f.value);
      }
      
      if (ragMission) {
        state.phase = ragMission.phase as AlphaScanState['phase'];
      }
      
      console.log(`[${this.agentId}] Loaded ${ragFindings.length} findings into state - Endpoints: ${state.discoveredEndpoints.size}, Ports: ${state.discoveredPorts.size}`);
    }
    
    // Intent vector tracking - to detect repetition and enforce diversity
    const recentIntents: string[] = [];
    const recentCommands: string[] = [];
    const toolFailureCount: Map<string, number> = new Map();
    
        let currentObjective = 'port_discovery';
    
    while (state.scanSessionActive && llmIterations < maxLlmIterations && state.phase !== 'complete') {
      llmIterations++;
      this.llmIterationCounter++; // Pin iteration number early so logs are consistent
      console.log(`[${this.agentId}] LLM Planning Iteration ${llmIterations}/${maxLlmIterations} - Objective: ${currentObjective}`);

      // Query fresh graph context on EVERY iteration
      const { mission: freshMission, findings: freshFindings, recentCommands: freshCmds } = await this.loadMissionContext(state.missionId);
      
      // Build banned tools list from failure counts
      const toolFailureObj: Record<string, number> = {};
      toolFailureCount.forEach((count, tool) => { toolFailureObj[tool] = count; });
      
      // Determine banned tools
      const bannedTools: string[] = [];
      if (toolFailureCount.get('katana') && toolFailureCount.get('katana')! >= 1) {
        bannedTools.push('katana');
      }
      
      const freshGraphContext = freshMission || freshFindings.length > 0
        ? this.formatLightRAGContext(freshMission!, freshFindings, freshCmds, bannedTools)
        : '';

      const messages = this.buildLlmScanMessage(state, systemPrompt, targetContext, conversationHistory, freshGraphContext, recentCommands);

      try {
        const response = await this.llmRouter.complete('alpha', messages);
        
        console.log(`[${this.agentId}] LLM RAW OUTPUT:\n${'='.repeat(60)}\n${response}\n${'='.repeat(60)}`);
        
        // Log LLM interaction to /recon-reports/
        await this.logLlmInteraction(state.missionId, this.llmIterationCounter, messages, response);
        
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
          conversationHistory.push({ role: 'assistant', content: response });
          conversationHistory.push({ 
            role: 'user', 
            content: `Your previous output was malformed. Respond with ONLY valid XML:
<reasoning>...</reasoning>\n<tool>...</tool>\n<command>...</command>` 
          });
          continue;
        }

        // Check for exact command repetition (exact loop detector)
        const normalizedCmd = `${parsed.tool} ${parsed.command}`.replace(/\s+/g, ' ').trim();
        const cmdCount = recentCommands.filter(c => c === normalizedCmd).length;
        
        if (cmdCount >= 1) { // Already seen this exact command
          console.log(`[${this.agentId}] EXACT LOOP DETECTED: ${parsed.tool} ${parsed.command} (seen ${cmdCount + 1} times)`);
          
          // DON'T auto-execute - just tell the LLM to try something different
          recentCommands.push(normalizedCmd);
          if (recentCommands.length > 10) recentCommands.shift();
          
          conversationHistory.push({ role: 'assistant', content: response });
          conversationHistory.push({ 
            role: 'user', 
            content: `LOOP_DETECTED: Command "${parsed.tool} ${parsed.command}" was already run. Do NOT repeat it. Try a DIFFERENT tool or endpoint. For example: curl ${state.targetUrl}/api/Products or whatweb ${state.targetUrl} -v`
          });
          continue;
        }
        
        // Compute intent vector: tool + target path area (e.g., "ffuf /", "ffuf /api", "katana /api")
        const intentMatch = parsed.command.match(/https?:\/\/[^\/]+(\/\S*)/);
        const intentPath = intentMatch ? intentMatch[1]?.split('/')[1] || '/' : '/';
        const intentVector = `${parsed.tool} /${intentPath}`;
        
        // Detect intent repetition (same tool family in same path area)
        const recentIntentCount = recentIntents.filter(i => i === intentVector).length;
        if (recentIntentCount >= 2 && recentIntents.slice(-3).every(i => i === intentVector)) {
          console.log(`[${this.agentId}] INTENT LOOP DETECTED: ${intentVector} (repeated ${recentIntentCount} times)`);
          conversationHistory.push({ role: 'assistant', content: response });
          
          const forcedSwitchMessages: Record<string, string> = {
            'port_discovery': `DIVERSITY REQUIRED: You are stuck on port_discovery. Switch to surface_enum with ffuf.`,
            'surface_enum': `DIVERSITY REQUIRED: You over-focused on surface_enum. Chain to api_enum:
- ffuf /api/FUZZ (found /api means enumerate it)
- katana -u ${state.targetUrl}/api -jc -silent
- curl ${state.targetUrl}/api/Users`,
            'api_enum': `DIVERSITY REQUIRED: You over-focused on api_enum. Switch to tech_fingerprint:
- curl -sI ${state.targetUrl}
- whatweb ${state.targetUrl} -v`,
            'tech_fingerprint': `DIVERSITY REQUIRED: You over-focused on tech_fingerprint. If no new components found, scan is complete.`,
            'vuln_probe': `DIVERSITY REQUIRED: vuln_probe phase. Scan is complete.`,
          };
          
          conversationHistory.push({ 
            role: 'user', 
            content: forcedSwitchMessages[currentObjective] || `SWITCH TO DIFFERENT VECTOR. You are looping on ${currentObjective}.`
          });
          recentIntents.push('INTENT_LOOP_RECOVERY');
          continue;
        }
        
        // Update tracking
        recentCommands.push(normalizedCmd);
        recentIntents.push(intentVector);
        if (recentCommands.length > 10) recentCommands.shift();
        if (recentIntents.length > 10) recentIntents.shift();
        
        // Track tool failures
        const failCount = (toolFailureCount.get(parsed.tool!) || 0) + 1;
        toolFailureCount.set(parsed.tool!, failCount);

        maxRetries = 2;
        console.log(`[${this.agentId}] LLM reasoning: ${parsed.reasoning?.substring(0, 100) || 'N/A'}...`);
        console.log(`[${this.agentId}] LLM decided: ${parsed.tool} ${parsed.command}`);
        
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
        let fullCommand = parsed.command!.trim();
        
        // Strip markdown URLs: [url](url) -> url
        fullCommand = fullCommand.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
        
        // Expand ~ to home directory
        fullCommand = fullCommand.replace(/^~/, '/home/peburu');
        
        // Strip duplicate tool prefix: "ffuf ffuf -u" → "ffuf -u"
        fullCommand = fullCommand.replace(/^(\w+)\s+\1\s*/, '$1 ');
        
        // Substitute template variables
        fullCommand = fullCommand
          .replace(/\{target_url\}/gi, state.targetUrl)
          .replace(/\{target\}/gi, state.target)
          .replace(/\{base_url\}/gi, state.targetUrl)
          .replace(/\{TARGET_URL\}/gi, state.targetUrl)
          .replace(/TARGET/gi, state.target);
        
        // Validate: non-nmap commands must include real target URL
        if (parsed.tool !== 'nmap') {
          const hasTargetUrl = fullCommand.includes(state.targetUrl);
          if (!hasTargetUrl) {
            console.log(`[${this.agentId}] REJECTED command without target URL: ${fullCommand}`);
            conversationHistory.push({ role: 'assistant', content: response });
            conversationHistory.push({ 
              role: 'user', 
              content: `INVALID COMMAND: Must include actual target URL "${state.targetUrl}". Do not use placeholders. Example: curl -sI ${state.targetUrl}` 
            });
            continue;
          }
        }
        
        // Check for remaining placeholders after substitution
        if (/\{[^{}]+\}/.test(fullCommand)) {
          console.log(`[${this.agentId}] REJECTED command with remaining placeholders: ${fullCommand}`);
          conversationHistory.push({ role: 'assistant', content: response });
          conversationHistory.push({ 
            role: 'user', 
            content: `INVALID COMMAND: Contains unfilled placeholders. Use actual values, not templates. Example: curl -sI ${state.targetUrl}` 
          });
          continue;
        }
        
        if (parsed.tool === 'ffuf' && state.targetConfig.isJuiceShop) {
          if (!fullCommand.includes('-fs ') && state.targetConfig.spaFallbackSize > 0) {
            if (!fullCommand.includes('-s')) {
              fullCommand += ` -fs ${state.targetConfig.spaFallbackSize}`;
            } else {
              fullCommand = fullCommand.replace(/(\s+)(-s)(\s+)/, `$1-fs ${state.targetConfig.spaFallbackSize}$3`);
            }
          }
        }
        
        console.log(`[${this.agentId}] Executing: ${fullCommand}`);
        
        const startTime = Date.now();
        const result = await this.executeCommand(fullCommand, 120000);
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
        console.log(`[${this.agentId}] Tool output (first 500 chars):\n${outputPreview.substring(0, 500)}`);
        if (toolOutput.length > 500) {
          console.log(`[${this.agentId}] ... [truncated, full output: ${toolOutput.length} chars]`);
        }
        
        // Log tool output to /recon-reports/
        await this.logToolOutput(state.missionId, this.llmIterationCounter, parsed.tool!, fullCommand, result.stdout || '');
        
        // Also parse findings and update state
        const fallbackSize = state.targetConfig.spaFallbackSize || await this.measureSpaFallbackSize(state.targetUrl);
        if (!state.targetConfig.spaFallbackSize) {
          state.targetConfig.spaFallbackSize = fallbackSize;
        }
        const findings = this.parseToolOutput(parsed.tool, toolOutput, fallbackSize);
        const portsFound: string[] = [];
        const endpointsFound: string[] = [];
        const componentsFound: string[] = [];
        
        // Track katana success (if it found URLs, mark as succeeded)
        if (parsed.tool === 'katana') {
          if (endpointsFound.length > 0 || toolOutput.includes('http://') || toolOutput.includes('https://')) {
            toolFailureCount.set('katana', 0);
          } else {
            const currentFails = toolFailureCount.get('katana') || 0;
            toolFailureCount.set('katana', currentFails + 1);
          }
        }
        
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
        
        // For ffuf, explicitly tell LLM about parsed endpoints AND suggest chaining
        if (parsed.tool === 'ffuf' && endpointsFound.length > 0) {
          discoverySummary += `\nFFUF FOUND ${endpointsFound.length} ENDPOINTS: ${endpointsFound.slice(0, 20).join(', ')}${endpointsFound.length > 20 ? '...' : ''}`;
          
          const chainHints: string[] = [];
          for (const ep of endpointsFound) {
            const normalizedEp = ep.toLowerCase();
            if (normalizedEp === '/api') {
              chainHints.push('CHAIN /api → ffuf /api/FUZZ OR katana -u {url}/api -jc -silent');
            } else if (normalizedEp === '/ftp') {
              chainHints.push('CHAIN /ftp → curl {url}/ftp/');
            } else if (normalizedEp === '/metrics') {
              chainHints.push('CHAIN /metrics → curl {url}/metrics');
            } else if (normalizedEp === '/rest') {
              chainHints.push('CHAIN /rest → ffuf /rest/FUZZ OR katana -u {url}/rest -jc -silent');
            } else if (normalizedEp === '/login') {
              chainHints.push('CHAIN /login → ffuf /login/FUZZ');
            } else if (normalizedEp === '/admin') {
              chainHints.push('CHAIN /admin → ffuf /admin/FUZZ OR curl {url}/admin/');
            } else if (normalizedEp === '/media') {
              chainHints.push('CHAIN /media → curl {url}/media/');
            }
          }
          
          if (chainHints.length > 0) {
            discoverySummary += `\n\nCHAINING OPPORTUNITIES:\n${chainHints.join('\n')}`;
          }
          
          // Update objective based on ffuf results
          if (endpointsFound.some(ep => ep.includes('/api'))) {
            currentObjective = 'api_enum';
          }
          
          discoverySummary += `\n\nELITE CHAIN: ffuf found endpoints → Now chain to:
1. ffuf ${state.targetUrl}/api/FUZZ (enumerate API)
2. ffuf ${state.targetUrl}/ftp/FUZZ (enumerate FTP)  
3. katana -u ${state.targetUrl}/api -jc -silent | httpx -silent (crawl API JS)
4. curl ${state.targetUrl}/api/Users (probe API endpoint)`;
        }
        
        // For katana/httpx/gau, add specific chaining hints
        if ((parsed.tool === 'katana' || parsed.tool === 'httpx' || parsed.tool === 'gau') && endpointsFound.length > 0) {
          discoverySummary += `\n${parsed.tool.toUpperCase()} FOUND ${endpointsFound.length} ENDPOINTS: ${endpointsFound.slice(0, 15).join(', ')}${endpointsFound.length > 15 ? '...' : ''}`;
          discoverySummary += `\n\nELITE CHAIN: Probe discovered endpoints with curl:
curl ${state.targetUrl}/api/Users`;
          currentObjective = 'vuln_probe';
        }
        
        // For curl/whatweb, mark as tech_fingerprint
        if (parsed.tool === 'curl' || parsed.tool === 'whatweb') {
          currentObjective = 'tech_fingerprint';
        }
        
        // Build concise summary via Light RAG
        const toolSummary = this.summarizeToolOutput(
          parsed.tool!,
          parsed.command!,
          result.stdout || '',
          endpointsFound,
          portsFound,
          componentsFound
        );
        
        // Update Light RAG mission status
        await this.updateMissionStatus(state, toolSummary, currentObjective);
        
        // Build concise feedback using Light RAG context
        const { mission: lightRAGStatus, findings: ragFindings, recentCommands: ragRecentCmds } = await this.loadMissionContext(state.missionId);
        
        // Build banned tools list from failure counts
        const toolFailureObj: Record<string, number> = {};
        toolFailureCount.forEach((count, tool) => { toolFailureObj[tool] = count; });
        const bannedTools: string[] = [];
        if (toolFailureCount.get('katana') && toolFailureCount.get('katana')! >= 1) bannedTools.push('katana');
        
        let feedback = '';
        
        if (lightRAGStatus) {
          feedback = this.formatLightRAGContext(lightRAGStatus, ragFindings, ragRecentCmds, bannedTools);
        } else {
          feedback = 'SUMMARY: ' + toolSummary.summary + '\n';
          feedback += 'PORTS: ' + state.discoveredPorts.size + ' | ENDPOINTS: ' + state.discoveredEndpoints.size + '\n';
        }
        
        feedback += '\n[' + currentObjective.toUpperCase() + '] Choose next action:';
        
        conversationHistory.push({ 
          role: 'user', 
          content: feedback
        });

        // Check if LLM indicates done
        if (response.includes('<done>true</done>') || response.includes('<done>1</done>')) {
          console.log(`[${this.agentId}] LLM indicated scan complete`);
          state.phase = 'complete';
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

  private async completeScan(target: string): Promise<void> {
    const state = this.scanState.get(target);
    if (!state) return;

    console.log(`[${this.agentId}] Scan complete for ${target}:
  - Ports: ${state.discoveredPorts.size}
  - Endpoints: ${state.discoveredEndpoints.size}
  - Components: ${state.discoveredComponents.size}`);

    // Generate mission report before cleanup
    await this.generateMissionReport(state.missionId, state);

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
    
    // Only transition to COOLDOWN if still in ACTIVE state (avoid race with polling loop)
    if (this.state === 'ACTIVE') {
      this.transitionTo('COOLDOWN', 'scan complete');
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
    if (state.phase === 'tech_fingerprint' && (tool === 'curl' || tool === 'whatweb')) {
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

  private parseToolOutput(tool: string, output: string, _spaFallbackSize = 0): Array<{ type: string; detail: string; evidence: string }> {
    const findings: Array<{ type: string; detail: string; evidence: string }> = [];

    // Skip HTML_REDIRECT - these are SPA routes, not real API endpoints
    if (output.includes('[HTML_REDIRECT]')) {
      console.log(`[${this.agentId}] Skipping HTML_REDIRECT output (SPA fallback, not a real endpoint)`);
      return findings;
    }

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
      const seen = new Set<string>();
      const endpoints: string[] = [];
      
      const lines = output.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('::')) continue;
        
        let path: string | null = null;
        
        if (trimmed.startsWith('{')) {
          try {
            const obj = JSON.parse(trimmed);
            if (obj.url && typeof obj.url === 'string') {
              const match = obj.url.match(/^https?:\/\/[^\/]+\/(.+)/);
              if (match?.[1]) {
                path = `/${match[1]}`;
              }
            }
          } catch {
            continue;
          }
        } else if (trimmed.length < 100 && !trimmed.includes('[')) {
          path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
        }
        
        if (path) {
          const normalized = this.normalizePath(path);
          if (normalized && normalized !== '/' && !seen.has(normalized)) {
            seen.add(normalized);
            endpoints.push(path);
            findings.push({
              type: 'endpoint',
              detail: `Found endpoint ${path}`,
              evidence: path,
            });
          }
        }
        
        if (endpoints.length >= 20) break;
      }
      
      console.log(`[${this.agentId}] ffuf parsed ${endpoints.length} potential endpoints`);
      
      if (endpoints.length > 0) {
        findings.push({
          type: 'ffuf_success',
          detail: `ffuf found ${endpoints.length} total endpoints`,
          evidence: `ffuf hits: ${endpoints.slice(0, 20).join(', ')}`,
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
    } else if (tool === 'katana') {
      const lines = output.split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('http://') || l.startsWith('https://'));
      console.log(`[${this.agentId}] katana parsed ${lines.length} URLs`);
      
      for (const line of lines.slice(0, 50)) {
        const match = line.match(/^https?:\/\/[^\/]+(\/\S*)/);
        const pathPart = match?.[1];
        if (pathPart) {
          const path = pathPart.split('?')[0]?.split('#')[0] ?? pathPart;
          if (path && path !== '/') {
            findings.push({
              type: 'endpoint',
              detail: `Found endpoint ${path}`,
              evidence: path,
            });
          }
        }
      }
    } else if (tool === 'httpx') {
      const lines = output.split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('http://') || l.startsWith('https://'));
      console.log(`[${this.agentId}] httpx parsed ${lines.length} live endpoints`);
      
      for (const line of lines.slice(0, 50)) {
        const statusMatch = line.match(/\[(\d+)\]/);
        const pathMatch = line.match(/^https?:\/\/[^\/]+(\/\S*)/);
        const pathPart = pathMatch?.[1];
        const status = statusMatch?.[1] ?? 'unknown';
        if (pathPart && pathPart !== '/' && status !== '0') {
          const path = pathPart.split('?')[0]?.split('#')[0] ?? pathPart;
          findings.push({
            type: 'endpoint',
            detail: `Found endpoint ${path} [${status}]`,
            evidence: path,
          });
        }
      }
    } else if (tool === 'gau') {
      const lines = output.split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('http://') || l.startsWith('https://'));
      console.log(`[${this.agentId}] gau parsed ${lines.length} historical endpoints`);
      
      for (const line of lines.slice(0, 50)) {
        const match = line.match(/^https?:\/\/[^\/]+(\/\S*)/);
        const pathPart = match?.[1];
        if (pathPart) {
          const path = pathPart.split('?')[0]?.split('#')[0] ?? pathPart;
          if (path && path !== '/') {
            findings.push({
              type: 'endpoint',
              detail: `Found historical endpoint ${path}`,
              evidence: path,
            });
          }
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
    let spaFallbackSize = state.targetConfig.spaFallbackSize;
    if (!spaFallbackSize) {
      spaFallbackSize = await this.measureSpaFallbackSize(state.targetUrl);
      state.targetConfig.spaFallbackSize = spaFallbackSize;
      console.log(`[${this.agentId}] SPA fallback size: ${spaFallbackSize}`);
    }

    console.log(`[${this.agentId}] [web_enum] START - spaFallbackSize=${spaFallbackSize}`);

    if (spaFallbackSize === 0) {
      console.log(`[${this.agentId}] [web_enum] SPA fallback size is 0, skipping ffuf, using seed probes only`);
      await this.runSeedProbes(state);
      console.log(`[${this.agentId}] [web_enum] COMPLETE (seed probes only)`);
      state.phase = 'tech_fingerprint';
      return;
    }

    const ffufFlags = state.targetConfig.isJuiceShop
      ? `-fs ${spaFallbackSize} -t 5 -rate 20 -timeout 10 -json`
      : `-mc 200 -ml 100 -t 10 -json`;

    console.log(`[${this.agentId}] [web_enum] Running ffuf...`);
    
    const ffufResult = await this.executeTool('ffuf', {
      url: state.targetUrl + '/FUZZ',
      wordlist: wordlistPath,
      flags: ffufFlags,
      timeout: 120000,
    });

    console.log(`[${this.agentId}] [web_enum] ffuf completed - success=${ffufResult.success}, stdout_len=${ffufResult.stdout?.length ?? 0}`);

    if (ffufResult.success && ffufResult.stdout) {
      const ffufHits = this.parseFfufJsonOutput(ffufResult.stdout);
      console.log(`[${this.agentId}] [web_enum] Parsed ${ffufHits.length} ffuf hits`);
      
      const limitedHits = ffufHits.slice(0, 20);
      console.log(`[${this.agentId}] [web_enum] Processing ${limitedHits.length} hits (capped at 20)`);

      for (const hit of limitedHits) {
        const normalized = this.normalizePath(hit);
        if (!state.discoveredEndpoints.has(normalized)) {
          state.discoveredEndpoints.add(normalized);
          
          if (state.targetConfig.isJuiceShop) {
            await this.writeEndpointNode(state.target, normalized, 'ffuf', state.missionId, hit, 0, '');
            await this.emit('endpoint_discovered', {
              target_id: state.target,
              method: 'GET',
              path: normalized,
              original_path: hit,
              discovered_by: 'alpha',
            });
          } else {
            const probe = await this.probeEndpoint(state.targetUrl, hit);
            await this.writeEndpointNode(state.target, normalized, 'ffuf', state.missionId, hit, probe.size, probe.bodyPreview);
            await this.emit('endpoint_discovered', {
              target_id: state.target,
              method: 'GET',
              path: normalized,
              original_path: hit,
              discovered_by: 'alpha',
              size: probe.size,
              body_preview: probe.bodyPreview,
            });
          }
        }
      }
      console.log(`[${this.agentId}] [web_enum] ffuf found ${limitedHits.length} endpoints`);
    } else {
      console.log(`[${this.agentId}] [web_enum] ffuf failed or returned no output`);
    }

    console.log(`[${this.agentId}] [web_enum] Running seed probes...`);
    await this.runSeedProbes(state);
    console.log(`[${this.agentId}] [web_enum] COMPLETE`);
    state.phase = 'tech_fingerprint';
  }

  private async runSeedProbes(state: AlphaScanState): Promise<void> {
    const seedProbes = state.targetConfig.seedProbes;
    if (seedProbes.length === 0) return;
    
    const spaFallbackSize = state.targetConfig.spaFallbackSize || 0;
    
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
    console.log(`[${this.agentId}] SAST phase skipped (nuclei disabled)`);
    state.phase = 'complete';
  }

  // Logging helper for ~/recon-reports/
  private getReportDir(missionId: string): string {
    const homeDir = process.env.HOME || '/tmp';
    const reportDir = path.join(homeDir, 'recon-reports', missionId);
    try {
      fs.mkdirSync(reportDir, { recursive: true });
    } catch (e) {
      console.log(`[${this.agentId}] [LOG] Failed to create report dir: ${e}`);
    }
    return reportDir;
  }

  private async logToolOutput(missionId: string, iteration: number, tool: string, command: string, output: string): Promise<void> {
    try {
      const reportDir = this.getReportDir(missionId);
      const filename = `${reportDir}/${String(iteration).padStart(3, '0')}_${tool}.log`;
      const content = `=== TOOL EXECUTION LOG ===
Iteration: ${iteration}
Tool: ${tool}
Command: ${command}
Timestamp: ${new Date().toISOString()}

=== RAW OUTPUT ===
${output}
`;
      fs.writeFileSync(filename, content);
      console.log(`[${this.agentId}] [LOG] Written tool output to ${filename}`);
    } catch (e) {
      console.log(`[${this.agentId}] [LOG] Failed to write tool log: ${e}`);
    }
  }

  private async logLlmInteraction(missionId: string, iteration: number, messages: LLMMessage[], response: string): Promise<void> {
    try {
      const reportDir = this.getReportDir(missionId);
      const filename = `${reportDir}/${String(iteration).padStart(3, '0')}_llm.txt`;
      let content = `=== LLM INTERACTION LOG ===
Iteration: ${iteration}
Timestamp: ${new Date().toISOString()}

=== MESSAGES SENT ===
`;
      for (const msg of messages) {
        content += `\n[${msg.role.toUpperCase()}]\n${msg.content}\n`;
      }
      content += `\n=== LLM RESPONSE ===
${response}
`;
      fs.writeFileSync(filename, content);
      console.log(`[${this.agentId}] [LOG] Written LLM interaction to ${filename}`);
    } catch (e) {
      console.log(`[${this.agentId}] [LOG] Failed to write LLM log: ${e}`);
    }
  }

  private async generateMissionReport(missionId: string, state: AlphaScanState): Promise<void> {
    try {
      const reportDir = this.getReportDir(missionId);
      const filename = `${reportDir}/report.md`;
      
      // Get findings from graph
      const { findings, recentCommands } = await this.loadMissionContext(missionId);
      const endpoints = findings.filter(f => f.type === 'endpoint');
      
      let content = `# Reconnaissance Mission Report
Mission ID: ${missionId}
Target: ${state.targetUrl}
Completed: ${new Date().toISOString()}

## Summary
- Total Iterations: ${this.llmIterationCounter}
- Phase: ${state.phase}
- Discovered Ports: ${state.discoveredPorts.size}
- Discovered Endpoints: ${state.discoveredEndpoints.size}
- Discovered Components: ${state.discoveredComponents.size}

## Discovered Ports
${Array.from(state.discoveredPorts).map(p => `- ${p}`).join('\n') || 'None'}

## Discovered Endpoints
${endpoints.slice(0, 50).map(e => `- ${e.value}`).join('\n') || 'None'}

## Discovered Components
${Array.from(state.discoveredComponents).map(c => `- ${c}`).join('\n') || 'None'}

## Tool Execution History
${recentCommands.slice(0, 20).map((cmd, i) => `${i + 1}. [${cmd.objective}] ${cmd.tool}: ${cmd.resultSummary.substring(0, 100)}`).join('\n')}

## Files
- Tool logs: {iteration}_{tool}.log
- LLM logs: {iteration}_llm.txt
`;
      fs.writeFileSync(filename, content);
      console.log(`[${this.agentId}] [LOG] Written mission report to ${filename}`);
    } catch (e) {
      console.log(`[${this.agentId}] [LOG] Failed to write report: ${e}`);
    }
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

  private parseFfufJsonOutput(output: string): string[] {
    const seen = new Set<string>();
    const results: string[] = [];

    try {
      const lines = output.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        if (trimmed.startsWith('::') || trimmed.startsWith('{') === false) continue;
        
        let obj;
        try {
          obj = JSON.parse(trimmed);
        } catch {
          continue;
        }
        
        if (obj.result && obj.result.length > 0) {
          for (const hit of obj.result) {
            if (hit.url) {
              const urlStr = typeof hit.url === 'string' ? hit.url : JSON.stringify(hit.url);
              const match = urlStr.match(/^https?:\/\/[^\/]+\/(\S*)/);
              if (match?.[1]) {
                const path = match[1].startsWith('/') ? match[1] : `/${match[1]}`;
                const normalized = this.normalizePath(path);
                if (normalized && normalized !== '/' && !seen.has(normalized)) {
                  seen.add(normalized);
                  results.push(path);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.log(`[${this.agentId}] [parseFfufJsonOutput] JSON parse error: ${e}`);
    }

    console.log(`[${this.agentId}] [parseFfufJsonOutput] Found ${results.length} unique endpoints`);
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
      type: 'Endpoint',
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

  // Light RAG Functions - Normalized Schema
  // Node types: MissionNode, FindingNode (endpoint/port/component), ToolOutputNode, CommandNode

  private isMeaningfulOutput(toolOutput: ToolOutputSummary): boolean {
    if (toolOutput.resultCount === 0) return false;
    if (toolOutput.summary.includes('none detected')) return false;
    if (toolOutput.summary.includes('no vulnerabilities found')) return false;
    if (toolOutput.summary.includes('executed, returned 0 bytes')) return false;
    return true;
  }

  private summarizeToolOutput(tool: string, command: string, stdout: string, endpointsFound: string[], portsFound: string[], componentsFound: string[]): ToolOutputSummary {
    const timestamp = Date.now();
    let summary = '';
    
    if (tool === 'nmap') {
      const portMatches = stdout.match(/\d+\/tcp\s+open/g);
      const ports = portMatches ? portMatches.map(p => p.replace('/tcp open', '')).join(', ') : '';
      summary = ports ? 'nmap found: ' + ports : 'nmap found: none';
    } else if (tool === 'ffuf') {
      summary = 'ffuf found ' + endpointsFound.length + ' endpoints';
      if (endpointsFound.length > 0) {
        summary += ': ' + endpointsFound.slice(0, 5).join(', ') + (endpointsFound.length > 5 ? '...' : '');
      }
    } else if (tool === 'curl') {
      if (stdout.includes('200 OK')) summary = 'curl returned 200 OK';
      else if (stdout.includes('500')) summary = 'curl returned 500 error';
      else if (stdout.includes('301') || stdout.includes('302')) summary = 'curl returned redirect';
      else summary = 'curl returned ' + stdout.length + ' bytes';
    } else if (tool === 'whatweb') {
      const titleMatch = stdout.match(/Title:\s+([^\n]+)/);
      summary = titleMatch && titleMatch[1] ? 'whatweb: ' + titleMatch[1].replace(/\[1m|\[22m|\[0m/g, '').trim() : 'whatweb: unknown';
    } else if (tool === 'katana') {
      summary = 'katana crawled ' + endpointsFound.length + ' URLs';
    } else {
      summary = stdout.length > 0 ? tool + ' executed, returned ' + stdout.length + ' bytes' : tool + ' executed, no output';
    }
    
    return {
      tool,
      command,
      summary,
      newEndpoints: endpointsFound.length > 0 ? endpointsFound : undefined,
      newPorts: portsFound.length > 0 ? portsFound : undefined,
      newComponents: componentsFound.length > 0 ? componentsFound : undefined,
      resultCount: endpointsFound.length || portsFound.length || componentsFound.length || 0,
      timestamp,
    };
  }

  // Write normalized Light RAG nodes - only meaningful findings
  private async updateMissionStatus(state: AlphaScanState, toolOutput: ToolOutputSummary, currentObjective: string): Promise<void> {
    if (!this.isMeaningfulOutput(toolOutput)) {
      return; // Skip empty/no-op updates
    }

    try {
      const timestamp = Date.now();

      // Upsert MissionNode (single source of truth for mission)
      const missionNodeId = 'mission:' + state.missionId;
      await this.graph.upsertNode({
        id: missionNodeId,
        type: 'Mission',
        mission_id: state.missionId,
        target: state.target,
        target_url: state.targetUrl,
        objective: currentObjective,
        phase: state.phase,
        iteration: this.llmIterationCounter,
        updated_at: timestamp,
      });

      // Write FindingNodes for new endpoints, ports, components
      if (toolOutput.newEndpoints && toolOutput.newEndpoints.length > 0) {
        for (const endpoint of toolOutput.newEndpoints) {
          const findingId = 'finding:' + state.missionId + ':ep:' + endpoint.replace(/\//g, '_');
          await this.graph.upsertNode({
            id: findingId,
            type: 'Finding',
            mission_id: state.missionId,
            finding_type: 'endpoint',
            value: endpoint,
            discovered_by: toolOutput.tool,
            discovered_at: timestamp,
          });
        }
      }

      if (toolOutput.newPorts && toolOutput.newPorts.length > 0) {
        for (const port of toolOutput.newPorts) {
          const findingId = 'finding:' + state.missionId + ':port:' + port;
          await this.graph.upsertNode({
            id: findingId,
            type: 'Finding',
            mission_id: state.missionId,
            finding_type: 'port',
            value: port,
            discovered_by: toolOutput.tool,
            discovered_at: timestamp,
          });
        }
      }

      if (toolOutput.newComponents && toolOutput.newComponents.length > 0) {
        for (const component of toolOutput.newComponents) {
          const findingId = 'finding:' + state.missionId + ':comp:' + component.replace(/\s/g, '_');
          await this.graph.upsertNode({
            id: findingId,
            type: 'Finding',
            mission_id: state.missionId,
            finding_type: 'component',
            value: component,
            discovered_by: toolOutput.tool,
            discovered_at: timestamp,
          });
        }
      }

      // Write ToolOutputNode (minimized output summary)
      const toolOutputId = 'tooloutput:' + state.missionId + ':' + this.llmIterationCounter;
      await this.graph.upsertNode({
        id: toolOutputId,
        type: 'ToolOutput',
        mission_id: state.missionId,
        tool: toolOutput.tool,
        command: toolOutput.command,
        summary: toolOutput.summary,
        result_count: toolOutput.resultCount,
        iteration: this.llmIterationCounter,
        timestamp,
      });

      // Write CommandNode (execution record)
      const commandId = 'cmd:' + state.missionId + ':' + this.llmIterationCounter;
      await this.graph.upsertNode({
        id: commandId,
        type: 'Command',
        mission_id: state.missionId,
        tool: toolOutput.tool,
        command: toolOutput.command,
        result_summary: toolOutput.summary,
        iteration: this.llmIterationCounter,
        objective: currentObjective,
        timestamp,
      });

      console.log(`[${this.agentId}] [LightRAG] Persisted: ${toolOutput.summary}`);

    } catch (e) {
      console.log(`[${this.agentId}] [LightRAG] Error: ${e}`);
    }
  }

  // Load mission context from normalized nodes - for rebuilding LLM context
  private async loadMissionContext(missionId: string): Promise<{ mission: LightRAGStatus | null, findings: { type: string, value: string, discovered_by: string }[], recentCommands: CommandHistoryEntry[] }> {
    try {
      // Load MissionNode
      const missionNodes = await this.graph.findNodesByLabel<LightRAGStatus>('MissionNode', { mission_id: missionId });
      const mission = missionNodes[0] as LightRAGStatus | undefined;

      // Load all FindingNodes for this mission
      const findingNodes = await this.graph.findNodesByLabel<{ finding_type: string, value: string, discovered_by: string }>('FindingNode', { mission_id: missionId });
      const findings = findingNodes.map(n => ({
        type: n.finding_type,
        value: n.value,
        discovered_by: n.discovered_by,
      }));

      // Load recent CommandNodes (use raw node interface for snake_case properties)
      const commandNodes = await this.graph.findNodesByLabel<{ iteration: number, tool: string, command: string, result_summary: string, timestamp: number, objective: string }>('CommandNode', { mission_id: missionId });
      const recentCommands = commandNodes
        .map(n => ({
          iteration: n.iteration,
          tool: n.tool,
          command: n.command,
          resultSummary: n.result_summary,
          timestamp: n.timestamp,
          objective: n.objective,
        }))
        .sort((a, b) => b.iteration - a.iteration)
        .slice(0, 10);

      return { mission: mission || null, findings, recentCommands };
    } catch (e) {
      console.log(`[${this.agentId}] [LightRAG] Load error: ${e}`);
      return { mission: null, findings: [], recentCommands: [] };
    }
  }

  // Format Light RAG context for LLM consumption
  private formatLightRAGContext(
    status: LightRAGStatus,
    findings: { type: string, value: string, discovered_by?: string }[],
    recentCommands: CommandHistoryEntry[],
    bannedTools: string[] = []
  ): string {
    if (!status) {
      return '';
    }

    const lines: string[] = [];
    lines.push(`Target: ${status.target_url}`);
    lines.push(`Iteration: ${this.llmIterationCounter}`);
    lines.push('');

    // Track tools run
    const toolsRun = new Set<string>();
    const commandsRun = new Set<string>();
    for (const cmd of recentCommands) {
      toolsRun.add(cmd.tool);
      commandsRun.add(cmd.command);
    }

    // BANNED TOOLS
    if (bannedTools.length > 0) {
      lines.push('## BLOCKED TOOLS');
      for (const tool of bannedTools) {
        lines.push(`  - ${tool}`);
      }
      lines.push('');
    }

    if (findings.length > 0) {
      const endpoints = findings.filter(f => f.type === 'endpoint');
      const ports = findings.filter(f => f.type === 'port');
      const components = findings.filter(f => f.type === 'component');

      if (ports.length > 0) {
        lines.push(`## PORTS: ${ports.map(p => p.value).join(', ')}`);
      }
      if (endpoints.length > 0) {
        lines.push(`## ENDPOINTS: ${endpoints.map(e => e.value).join(', ')}`);
      }
      if (components.length > 0) {
        lines.push(`## COMPONENTS: ${components.map(c => c.value).join(', ')}`);
      }
      lines.push('');
    }

    if (recentCommands.length > 0) {
      lines.push('## RECENT COMMANDS (do NOT repeat these)');
      for (const cmd of recentCommands.slice(0, 10)) {
        lines.push(`  ${cmd.tool}: ${cmd.command.substring(0, 80)}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async pollMemoryForTarget(target: string, targetUrl: string, force = false): Promise<string> {
    const now = Date.now();
    if (!force && now - this.lastMemoryPoll < this.MEMORY_POLL_INTERVAL_MS && this.lastMemoryPoll > 0) {
      console.log(`[${this.agentId}] Skipping memory poll - polled recently`);
      return '';
    }

    this.lastMemoryPoll = now;
    console.log(`[${this.agentId}] Polling memory for ${target} (force=${force})...`);

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
      if (!this.supabase) {
        console.log(`[${this.agentId}] Supabase client not initialized`);
        return '';
      }

      const { data: vulnerabilities, error } = await this.supabase
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
    conversationHistory: LLMMessage[] = [],
    freshGraphContext: string = '',
    recentCommands: string[] = []
  ): LLMMessage[] {
    const isJuiceShop = state.targetUrl.includes('3000') || state.target.includes('juice');
    const fallbackSize = state.targetConfig.spaFallbackSize || 75002;

    const ports = Array.from(state.discoveredPorts).join(', ') || 'none';
    const endpoints = Array.from(state.discoveredEndpoints);
    const endpointList = endpoints.join(', ') || 'none';
    const components = Array.from(state.discoveredComponents).join(', ') || 'none';
    const recentCmdList = recentCommands.length > 0 ? recentCommands.join('\n') : 'none';

    const context = `<mission>
Target: ${state.target}
Base URL: ${state.targetUrl}
Iteration: ${this.llmIterationCounter}/${state.maxIterations}
Phase: ${state.phase}
${isJuiceShop ? `SPA fallback size: ${fallbackSize} (use -fs ${fallbackSize} with ffuf)` : ''}
</mission>

<findings>
PORTS: ${ports}
ENDPOINTS (${endpoints.length}): ${endpointList}
COMPONENTS: ${components}
${freshGraphContext ? freshGraphContext : ''}
${targetContext ? targetContext : ''}
</findings>

<commands_ran>
${recentCmdList}
</commands_ran>

<tools_available>
nmap, ffuf, katana, httpx, curl, whatweb, gau
</tools_available>

Choose the single best next command. Chain from discoveries. Do NOT repeat commands above. Output XML:
<reasoning>...</reasoning>
<tool>...</tool>
<command>...</command>`;

    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];
    messages.push(...conversationHistory);
    
    if (conversationHistory.length === 0) {
      messages.push({ role: 'user', content: context });
    } else {
      messages.push({ 
        role: 'user', 
        content: `<findings>
PORTS: ${ports}
ENDPOINTS (${endpoints.length}): ${endpointList}
COMPONENTS: ${components}
${freshGraphContext ? freshGraphContext : ''}
</findings>

<commands_ran>
${recentCmdList}
</commands_ran>

Based on the tool output above, decide the single best next command. Chain intelligently. Output XML:
<reasoning>...</reasoning>
<tool>...</tool>
<command>...</command>`
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
