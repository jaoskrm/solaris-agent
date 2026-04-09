import type { LLMCallOptions, LLMProvider } from './ollama.js';

export class MinimaxProvider implements LLMProvider {
  name = 'minimax';

  isAvailable(): boolean {
    return !!process.env.MINIMAX_API_KEY;
  }

  async chat(options: LLMCallOptions): Promise<string> {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) throw new Error('MINIMAX_API_KEY not set');

    const baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat/v1';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

    try {
      const response = await fetch(`${baseUrl}/text/chatcompletion_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 8192,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Minimax ${response.status}: ${err}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
