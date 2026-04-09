import { AGENT_MODEL_CONFIG, type AgentType } from './models.js';
import type { LLMMessage, LLMCallOptions, LLMProvider } from './providers/ollama.js';
import { OllamaProvider } from './providers/ollama.js';
import { GroqProvider } from './providers/groq.js';
import { CerebrasProvider } from './providers/cerebras.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GoogleProvider } from './providers/google.js';
import { MinimaxProvider } from './providers/minimax.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class LLMRouter {
  private providers: Map<string, LLMProvider>;
  private rateLimits = new Map<string, RateLimitEntry>();

  private readonly DEFAULT_CASCADE: Record<string, string[]> = {
    'nvidia/nemotron-3-super': ['openrouter/anthropic/nvidia/nemotron-3-super', 'google/gemini-2.0-flash'],
    'google/gemini-2.0-flash': ['groq/llama-3.3-70b', 'openrouter/meta-llama/llama-3.3-70b'],
    'google/gemini-1.5-pro': ['openrouter/google/gemini-1.5-pro', 'openrouter/anthropic/claude-3.5-haiku'],
  };

  constructor() {
    this.providers = new Map([
      ['ollama', new OllamaProvider()],
      ['groq', new GroqProvider()],
      ['cerebras', new CerebrasProvider()],
      ['openrouter', new OpenRouterProvider()],
      ['anthropic', new AnthropicProvider()],
      ['google', new GoogleProvider()],
      ['minimax', new MinimaxProvider()],
    ]);
  }

  async complete(
    agentType: AgentType,
    messages: LLMMessage[],
    overrides?: Partial<{ temperature: number; maxTokens: number; contextWindow: number; schema: object }>
  ): Promise<string> {
    const config = AGENT_MODEL_CONFIG[agentType];
    if (!config) throw new Error(`Unknown agent type: ${agentType}`);

    const temperature = overrides?.temperature ?? config.temperature;
    const maxTokens = overrides?.maxTokens ?? config.maxTokens ?? 8192;
    const contextWindow = overrides?.contextWindow ?? config.contextWindow;

    const primaryProvider = this.providers.get(config.provider);
    if (primaryProvider?.isAvailable()) {
      try {
        return await this.callProvider(primaryProvider, config.primary, messages, temperature, maxTokens, contextWindow, overrides?.schema);
      } catch (error) {
        console.warn(`[LLMRouter] Primary ${config.provider}/${config.primary} failed: ${error}`);
      }
    }

    const cascade = this.DEFAULT_CASCADE[config.primary] || [];
    for (const model of cascade) {
      const providerName = this.providerForModel(model);
      const provider = this.providers.get(providerName);
      if (provider?.isAvailable()) {
        try {
          return await this.callProvider(provider, model, messages, temperature, maxTokens, contextWindow, overrides?.schema);
        } catch (error) {
          console.warn(`[LLMRouter] Cascade ${providerName}/${model} failed: ${error}`);
        }
      }
    }

    for (const [name, provider] of this.providers) {
      if (provider.isAvailable()) {
        try {
          return await this.callProvider(provider, config.fallback, messages, temperature, maxTokens, contextWindow, overrides?.schema);
        } catch (error) {
          console.warn(`[LLMRouter] Fallback ${name}/${config.fallback} failed: ${error}`);
        }
      }
    }

    throw new Error(`[LLMRouter] All providers exhausted for agent ${agentType}`);
  }

  private async callProvider(
    provider: LLMProvider,
    model: string,
    messages: LLMMessage[],
    temperature: number,
    maxTokens: number,
    contextWindow?: number,
    schema?: object
  ): Promise<string> {
    const rateKey = `${provider.name}:${model}`;
    if (this.isRateLimited(rateKey)) {
      throw new Error(`Rate limited: ${rateKey}`);
    }

    const options: LLMCallOptions = {
      model,
      messages,
      temperature,
      maxTokens,
      contextWindow,
      schema,
      timeout: 120000,
    };

    const result = await provider.chat(options);
    this.recordRequest(rateKey);
    return result;
  }

  private isRateLimited(key: string): boolean {
    const entry = this.rateLimits.get(key);
    if (!entry) return false;
    if (Date.now() > entry.resetAt) {
      this.rateLimits.delete(key);
      return false;
    }
    return entry.count >= this.getLimit(key);
  }

  private getLimit(key: string): number {
    if (key.startsWith('ollama:')) return 60;
    if (key.startsWith('groq:')) return 30;
    if (key.startsWith('cerebras:')) return 20;
    return 60;
  }

  private recordRequest(key: string): void {
    const now = Date.now();
    const resetAt = now + 60000;
    const existing = this.rateLimits.get(key);
    if (existing && now < existing.resetAt) {
      existing.count++;
    } else {
      this.rateLimits.set(key, { count: 1, resetAt });
    }
  }

  private providerForModel(model: string): string {
    if (model.includes('/')) {
      const parts = model.split('/');
      return parts[0] || 'ollama';
    }
    return 'ollama';
  }
}

export const llmRouter = new LLMRouter();