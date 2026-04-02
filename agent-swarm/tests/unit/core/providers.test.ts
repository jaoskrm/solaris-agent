import { describe, it, expect } from 'vitest';
import type { LLMMessage, LLMCallOptions, LLMProvider } from '../../../src/core/providers/ollama';

describe('LLM Provider Types', () => {
  it('should define LLMMessage interface correctly', () => {
    const message: LLMMessage = {
      role: 'user',
      content: 'Test message'
    };
    expect(message.role).toBe('user');
    expect(message.content).toBe('Test message');
  });

  it('should define valid roles', () => {
    const roles: LLMMessage['role'][] = ['system', 'user', 'assistant'];
    for (const role of roles) {
      const message: LLMMessage = { role, content: 'test' };
      expect(message.role).toBe(role);
    }
  });

  it('should define LLMCallOptions interface', () => {
    const options: LLMCallOptions = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'test' }],
      temperature: 0.7,
      maxTokens: 1024,
    };
    expect(options.model).toBe('test-model');
    expect(options.temperature).toBe(0.7);
  });

  it('should allow optional schema in LLMCallOptions', () => {
    const options: LLMCallOptions = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'test' }],
      schema: { type: 'object' }
    };
    expect(options.schema).toBeDefined();
  });

  it('should allow optional timeout in LLMCallOptions', () => {
    const options: LLMCallOptions = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'test' }],
      timeout: 30000
    };
    expect(options.timeout).toBe(30000);
  });
});