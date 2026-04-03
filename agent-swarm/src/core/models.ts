// Ollama models (verified - benchmark tested):
// ollama pull llama3-groq-tool-use:8b-q4_K_M  (already installed)
// ollama pull qwen2.5-coder:7b-instruct-q4_K_M  (already installed)
// ollama pull llama3.1:8b-instruct-q4_K_M  (already installed)
// ollama pull phi3:3.8b-mini-128k-instruct-q4_K_M  (already installed)
//
// Note: Ollama models scored poorly on JSON generation (0-17% valid)
// Use Groq/Cerebras for JSON-heavy tasks

export interface AgentModelConfig {
  primary: string;
  fallback: string;
  temperature: number;
  maxTokens?: number;
  provider: 'ollama' | 'groq' | 'cerebras' | 'openrouter' | 'anthropic' | 'google';
}

export const AGENT_MODEL_CONFIG: Record<string, AgentModelConfig> = {
  // Tier 1: Nano — Ollama (unlimited, local)
  // Benchmark: 0-17% valid JSON (poor at JSON generation)
  verifier: {
    primary: process.env.VERIFIER_MODEL || 'phi3:3.8b-mini-128k-instruct-q4_K_M',
    fallback: process.env.VERIFIER_MODEL_FALLBACK || 'llama3.1:8b-instruct-q4_K_M',
    temperature: 0.0,
    maxTokens: 2048,
    provider: 'ollama',
  },
  critic: {
    primary: process.env.CRITIC_MODEL || 'phi3:3.8b-mini-128k-instruct-q4_K_M',
    fallback: process.env.CRITIC_MODEL_FALLBACK || 'llama3.1:8b-instruct-q4_K_M',
    temperature: 0.15,
    maxTokens: 4096,
    provider: 'ollama',
  },

  // Tier 2: Heavy exploit — Ollama primary + Groq cloud fallback
  // Note: ollama pull llama3-groq-tool-use:8b-q4_K_M, qwen2.5-coder:7b-instruct-q4_K_M
  gamma: {
    primary: process.env.GAMMA_MODEL || 'llama3-groq-tool-use:8b-q4_K_M',
    fallback: process.env.GAMMA_MODEL_FALLBACK || 'moonshotai/kimi-k2-instruct',
    temperature: 0.85,
    maxTokens: 8192,
    provider: 'ollama',
  },
  alpha: {
    primary: process.env.ALPHA_MODEL || 'qwen2.5-coder:7b-instruct-q4_K_M',
    fallback: process.env.ALPHA_MODEL_FALLBACK || 'moonshotai/kimi-k2-instruct',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },
  mcp: {
    primary: process.env.MCP_MODEL || 'llama3-groq-tool-use:8b-q4_K_M',
    fallback: process.env.MCP_MODEL_FALLBACK || 'moonshotai/kimi-k2-instruct',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },
  specialist: {
    primary: process.env.SPECIALIST_MODEL || 'llama3-groq-tool-use:8b-q4_K_M',
    fallback: process.env.SPECIALIST_MODEL_FALLBACK || 'moonshotai/kimi-k2-instruct',
    temperature: 0.85,
    maxTokens: 8192,
    provider: 'ollama',
  },
  post_exploit: {
    primary: process.env.POST_MODEL || 'qwen2.5-coder:7b-instruct-q4_K_M',
    fallback: process.env.POST_MODEL_FALLBACK || 'moonshotai/kimi-k2-instruct',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },

  // Tier 3: Reasoning — Groq (100% JSON valid @ 367ms)
  commander: {
    primary: process.env.COMMANDER_MODEL || 'llama-3.3-70b-versatile',
    fallback: process.env.COMMANDER_MODEL_FALLBACK || 'nvidia/nemotron-3-nano-30b-a3b:free',
    temperature: 0.5,
    maxTokens: 16384,
    provider: 'groq',
  },

  // Tier 4: Planning — Cerebras (100% JSON valid @ 471ms)
  mission_planner: {
    primary: process.env.PLANNER_MODEL || 'qwen-3-235b-a22b-instruct-2507',
    fallback: process.env.PLANNER_MODEL_FALLBACK || 'nvidia/nemotron-3-nano-30b-a3b:free',
    temperature: 0.85,
    maxTokens: 16384,
    provider: 'cerebras',
  },
  chain_planner: {
    primary: process.env.CHAIN_MODEL || 'qwen-3-235b-a22b-instruct-2507',
    fallback: process.env.CHAIN_MODEL_FALLBACK || 'nvidia/nemotron-3-nano-30b-a3b:free',
    temperature: 0.85,
    maxTokens: 16384,
    provider: 'cerebras',
  },
  osint: {
    primary: process.env.OSINT_MODEL || 'llama-3.1-8b',
    fallback: process.env.OSINT_MODEL_FALLBACK || 'google/gemma-3-27b-it',
    temperature: 0.65,
    maxTokens: 16384,
    provider: 'cerebras',
  },

  // Tier 5: Output — OpenRouter free (100% JSON valid, 3.7s)
  report_agent: {
    primary: process.env.REPORT_MODEL || 'nvidia/nemotron-3-nano-30b-a3b:free',
    fallback: process.env.REPORT_MODEL_FALLBACK || 'qwen-3-235b-a22b-instruct-2507',
    temperature: 0.3,
    maxTokens: 65536,
    provider: 'openrouter',
  },
} as const;

export type AgentType = keyof typeof AGENT_MODEL_CONFIG;