export interface AgentModelConfig {
  primary: string;
  fallback: string;
  temperature: number;
  maxTokens?: number;
  provider: 'ollama' | 'groq' | 'cerebras' | 'openrouter' | 'anthropic' | 'google';
}

export const AGENT_MODEL_CONFIG: Record<string, AgentModelConfig> = {
  // Tier 1: Nano — Ollama (unlimited, local) + Groq fallback (14,400 RPD!)
  verifier: {
    primary: process.env.VERIFIER_MODEL || 'phi-3-mini-128k-instruct-q4_K_M',
    fallback: process.env.VERIFIER_MODEL_FALLBACK || 'meta-llama/llama-3.1-8b-instruct',
    temperature: 0.0,
    maxTokens: 2048,
    provider: 'ollama',
  },
  critic: {
    primary: process.env.CRITIC_MODEL || 'phi-3-mini-128k-instruct-q4_K_M',
    fallback: process.env.CRITIC_MODEL_FALLBACK || 'meta-llama/llama-3.1-8b-instruct',
    temperature: 0.15,
    maxTokens: 4096,
    provider: 'ollama',
  },

  // Tier 2: Heavy exploit — Ollama primary + Cerebras cloud fallback (14,400 RPD!)
  gamma: {
    primary: process.env.GAMMA_MODEL || 'llama3-groq-tool-use:8b-q4_K_M',
    fallback: process.env.GAMMA_MODEL_FALLBACK || 'gpt-oss-120b',
    temperature: 0.85,
    maxTokens: 8192,
    provider: 'ollama',
  },
  alpha: {
    primary: process.env.ALPHA_MODEL || 'qwen2.5-coder:7b-q4_K_M',
    fallback: process.env.ALPHA_MODEL_FALLBACK || 'meta-llama/llama-3.1-8b-instruct',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },
  mcp: {
    primary: process.env.MCP_MODEL || 'llama3-groq-tool-use:8b-q4_K_M',
    fallback: process.env.MCP_MODEL_FALLBACK || 'gpt-oss-120b',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },
  specialist: {
    primary: process.env.SPECIALIST_MODEL || 'llama3-groq-tool-use:8b-q4_K_M',
    fallback: process.env.SPECIALIST_MODEL_FALLBACK || 'gpt-oss-120b',
    temperature: 0.85,
    maxTokens: 8192,
    provider: 'ollama',
  },
  post_exploit: {
    primary: process.env.POST_MODEL || 'qwen2.5-coder:7b-q4_K_M',
    fallback: process.env.POST_MODEL_FALLBACK || 'gpt-oss-120b',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },

  // Tier 3: Reasoning — Groq Kimi-K2 (best reasoning, 1K RPD)
  commander: {
    primary: process.env.COMMANDER_MODEL || 'moonshotai/kimi-k2-instruct',
    fallback: process.env.COMMANDER_MODEL_FALLBACK || 'meta-llama/llama-3.3-70b-instruct',
    temperature: 0.5,
    maxTokens: 16384,
    provider: 'groq',
  },

  // Tier 4: Planning — Cerebras primary (14,400 RPD + 1M tokens/day!)
  mission_planner: {
    primary: process.env.PLANNER_MODEL || 'gpt-oss-120b',
    fallback: process.env.PLANNER_MODEL_FALLBACK || 'google/gemma-3-27b-it',
    temperature: 0.85,
    maxTokens: 16384,
    provider: 'cerebras',
  },
  chain_planner: {
    primary: process.env.CHAIN_MODEL || 'gpt-oss-120b',
    fallback: process.env.CHAIN_MODEL_FALLBACK || 'qwen/qwen3-32b',
    temperature: 0.85,
    maxTokens: 16384,
    provider: 'cerebras',
  },
  osint: {
    primary: process.env.OSINT_MODEL || 'meta-llama/llama-3.1-8b-instruct',
    fallback: process.env.OSINT_MODEL_FALLBACK || 'google/gemma-3-27b-it',
    temperature: 0.65,
    maxTokens: 16384,
    provider: 'cerebras',
  },

  // Tier 5: Output — GPT-OSS-120B one-shot (Cerebras best quality, 1M TPD)
  report_agent: {
    primary: process.env.REPORT_MODEL || 'gpt-oss-120b',
    fallback: process.env.REPORT_MODEL_FALLBACK || 'openai/gpt-oss-120b:free',
    temperature: 0.3,
    maxTokens: 65536,
    provider: 'cerebras',
  },
} as const;

export type AgentType = keyof typeof AGENT_MODEL_CONFIG;