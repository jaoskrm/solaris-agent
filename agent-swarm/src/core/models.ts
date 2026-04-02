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
    fallback: process.env.VERIFIER_MODEL_FALLBACK || 'phi-3-mini',
    temperature: 0.0,
    maxTokens: 2048,
    provider: 'ollama',
  },
  critic: {
    primary: process.env.CRITIC_MODEL || 'nemotron-3-nano',
    fallback: process.env.CRITIC_MODEL_FALLBACK || 'phi-3-mini',
    temperature: 0.15,
    maxTokens: 4096,
    provider: 'ollama',
  },
  gamma: {
    primary: process.env.GAMMA_MODEL || 'llama3-groq-tool-use:8b-q4_K_M',
    fallback: process.env.GAMMA_MODEL_FALLBACK || 'qwen2.5-coder:7b-q4_K_M',
    temperature: 0.85,
    maxTokens: 8192,
    provider: 'ollama',
  },
  alpha: {
    primary: process.env.ALPHA_MODEL || 'qwen2.5-coder:7b-q4_K_M',
    fallback: process.env.ALPHA_MODEL_FALLBACK || 'llama3-groq-tool-use:8b-q4_K_M',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },
  mcp: {
    primary: process.env.MCP_MODEL || 'llama3-groq-tool-use:8b-q4_K_M',
    fallback: process.env.MCP_MODEL_FALLBACK || 'qwen2.5-coder:7b-q4_K_M',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },
  specialist: {
    primary: process.env.SPECIALIST_MODEL || 'llama3-groq-tool-use:8b-q4_K_M',
    fallback: process.env.SPECIALIST_MODEL_FALLBACK || 'qwen2.5-coder:7b-q4_K_M',
    temperature: 0.85,
    maxTokens: 8192,
    provider: 'ollama',
  },
  post_exploit: {
    primary: process.env.POST_MODEL || 'qwen2.5-coder:7b-q4_K_M',
    fallback: process.env.POST_MODEL_FALLBACK || 'llama3-groq-tool-use:8b-q4_K_M',
    temperature: 0.65,
    maxTokens: 8192,
    provider: 'ollama',
  },
  commander: {
    primary: process.env.COMMANDER_MODEL || 'llama3-groq-tool-use:70b',
    fallback: process.env.COMMANDER_MODEL_FALLBACK || 'llama-3.3-70b-versatile',
    temperature: 0.5,
    maxTokens: 16384,
    provider: 'groq',
  },
  mission_planner: {
    primary: process.env.PLANNER_MODEL || 'nvidia/nemotron-3-super:free',
    fallback: process.env.PLANNER_MODEL_FALLBACK || 'deepseek-v3:free',
    temperature: 0.85,
    maxTokens: 16384,
    provider: 'openrouter',
  },
  chain_planner: {
    primary: process.env.CHAIN_MODEL || 'deepseek-r1:free',
    fallback: process.env.CHAIN_MODEL_FALLBACK || 'qwen3-32b:free',
    temperature: 0.85,
    maxTokens: 16384,
    provider: 'openrouter',
  },
  osint: {
    primary: process.env.OSINT_MODEL || 'llama3.3-70b',
    fallback: process.env.OSINT_MODEL_FALLBACK || 'qwen3-32b',
    temperature: 0.65,
    maxTokens: 16384,
    provider: 'cerebras',
  },
  report_agent: {
    primary: process.env.REPORT_MODEL || 'gpt-oss-120b:free',
    fallback: process.env.REPORT_MODEL_FALLBACK || 'gemma-3-27b:free',
    temperature: 0.3,
    maxTokens: 65536,
    provider: 'openrouter',
  },
} as const;

export type AgentType = keyof typeof AGENT_MODEL_CONFIG;