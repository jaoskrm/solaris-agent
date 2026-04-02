export interface AgentModelConfig {
  primary: string;
  fallback: string;
  temperature: number;
  maxTokens?: number;
  provider: 'ollama' | 'groq' | 'cerebras' | 'openrouter' | 'anthropic' | 'google';
}

export const AGENT_MODEL_CONFIG: Record<string, AgentModelConfig> = {
  verifier: {
    primary: process.env.VERIFIER_MODEL || 'nemotron-3-nano',
    fallback: process.env.VERIFIER_MODEL_FALLBACK || 'nemotron-3-nano',
    temperature: 0.0,
    maxTokens: 2048,
    provider: 'ollama',
  },
  critic: {
    primary: process.env.CRITIC_MODEL || 'nemotron-3-nano',
    fallback: process.env.CRITIC_MODEL_FALLBACK || 'nemotron-3-nano',
    temperature: 0.15,
    maxTokens: 4096,
    provider: 'ollama',
  },
  gamma: {
    primary: process.env.GAMMA_MODEL || 'qwen2.5:14b-instruct',
    fallback: process.env.GAMMA_MODEL_FALLBACK || 'qwen2.5:14b',
    temperature: 0.85,
    maxTokens: 8192,
    provider: 'ollama',
  },
  alpha: {
    primary: process.env.ALPHA_MODEL || 'qwen2.5:14b-instruct',
    fallback: process.env.ALPHA_MODEL_FALLBACK || 'qwen2.5:14b',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },
  mcp: {
    primary: process.env.MCP_MODEL || 'qwen2.5:14b-instruct',
    fallback: process.env.MCP_MODEL_FALLBACK || 'qwen2.5:14b',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },
  specialist: {
    primary: process.env.SPECIALIST_MODEL || 'qwen2.5:14b-instruct',
    fallback: process.env.SPECIALIST_MODEL_FALLBACK || 'qwen2.5:14b',
    temperature: 0.85,
    maxTokens: 8192,
    provider: 'ollama',
  },
  post_exploit: {
    primary: process.env.POST_MODEL || 'qwen2.5:14b-instruct',
    fallback: process.env.POST_MODEL_FALLBACK || 'qwen2.5:14b',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },
  commander: {
    primary: process.env.COMMANDER_MODEL || 'nvidia/nemotron-3-super',
    fallback: process.env.COMMANDER_MODEL_FALLBACK || 'google/gemini-2.0-flash',
    temperature: 0.5,
    maxTokens: 16384,
    provider: 'openrouter',
  },
  mission_planner: {
    primary: process.env.PLANNER_MODEL || 'google/gemini-2.0-flash',
    fallback: process.env.PLANNER_MODEL_FALLBACK || 'groq/llama-3.3-70b',
    temperature: 0.85,
    maxTokens: 16384,
    provider: 'google',
  },
  chain_planner: {
    primary: process.env.CHAIN_MODEL || 'google/gemini-2.0-flash',
    fallback: process.env.CHAIN_MODEL_FALLBACK || 'groq/llama-3.3-70b',
    temperature: 0.85,
    maxTokens: 16384,
    provider: 'google',
  },
  osint: {
    primary: process.env.OSINT_MODEL || 'google/gemini-2.0-flash',
    fallback: process.env.OSINT_MODEL_FALLBACK || 'groq/llama-3.3-70b',
    temperature: 0.65,
    maxTokens: 16384,
    provider: 'google',
  },
  report_agent: {
    primary: process.env.REPORT_MODEL || 'google/gemini-1.5-pro',
    fallback: process.env.REPORT_MODEL_FALLBACK || 'openrouter/anthropic/claude-3.5-haiku',
    temperature: 0.3,
    maxTokens: 65536,
    provider: 'google',
  },
} as const;

export type AgentType = keyof typeof AGENT_MODEL_CONFIG;