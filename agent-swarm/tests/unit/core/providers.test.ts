import { describe, it, expect } from 'vitest';
import { OllamaProvider } from '../../../src/core/providers/ollama';
import { GroqProvider } from '../../../src/core/providers/groq';
import { CerebrasProvider } from '../../../src/core/providers/cerebras';
import { GoogleProvider } from '../../../src/core/providers/google';
import { OpenRouterProvider } from '../../../src/core/providers/openrouter';

const TIMEOUT = 30000;

const TEST_MESSAGE = { role: 'user' as const, content: 'Say "TEST_PASS" and nothing else.' };
const MATH_MESSAGE = { role: 'user' as const, content: 'What is 3+5? Answer with only the number.' };

describe('LLM Providers', () => {
  describe('Groq', () => {
    const provider = new GroqProvider();

    it('should report availability based on API key', () => {
      const available = provider.isAvailable();
      console.log(`Groq available: ${available}`);
      if (!available) console.log('  (GROQ_API_KEY not set - skipping live tests)');
    });

    if (provider.isAvailable()) {
      it('should return a response from kimi-k2-instruct', async () => {
        const response = await provider.chat({
          model: 'moonshotai/kimi-k2-instruct',
          messages: [TEST_MESSAGE],
          temperature: 0.1,
          maxTokens: 50,
          timeout: TIMEOUT,
        });
        expect(response).toContain('TEST_PASS');
      }, TIMEOUT);

      it('should handle math correctly', async () => {
        const response = await provider.chat({
          model: 'moonshotai/kimi-k2-instruct',
          messages: [MATH_MESSAGE],
          temperature: 0,
          maxTokens: 10,
          timeout: TIMEOUT,
        });
        const cleanResponse = response.trim();
        expect(cleanResponse).toBe('8');
      }, TIMEOUT);

      it('should benchmark latency', async () => {
        const start = Date.now();
        await provider.chat({
          model: 'moonshotai/kimi-k2-instruct',
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: 0.1,
          maxTokens: 10,
          timeout: TIMEOUT,
        });
        const latency = Date.now() - start;
        console.log(`  Groq (kimi-k2-instruct) latency: ${latency}ms`);
        expect(latency).toBeLessThan(TIMEOUT);
      }, TIMEOUT);
    }
  });

  describe('Cerebras', () => {
    const provider = new CerebrasProvider();

    it('should report availability based on API key', () => {
      const available = provider.isAvailable();
      console.log(`Cerebras available: ${available}`);
      if (!available) console.log('  (CEREBRAS_API_KEY not set - skipping live tests)');
    });

    if (provider.isAvailable()) {
      it('should return a response from llama-3.1-8b', async () => {
        const response = await provider.chat({
          model: 'llama-3.1-8b',
          messages: [TEST_MESSAGE],
          temperature: 0.1,
          maxTokens: 50,
          timeout: TIMEOUT,
        });
        expect(response).toContain('TEST_PASS');
      }, TIMEOUT);

      it('should handle math correctly', async () => {
        const response = await provider.chat({
          model: 'llama-3.1-8b',
          messages: [MATH_MESSAGE],
          temperature: 0,
          maxTokens: 10,
          timeout: TIMEOUT,
        });
        const cleanResponse = response.trim();
        expect(cleanResponse).toBe('8');
      }, TIMEOUT);

      it('should benchmark latency', async () => {
        const start = Date.now();
        await provider.chat({
          model: 'llama-3.1-8b',
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: 0.1,
          maxTokens: 10,
          timeout: TIMEOUT,
        });
        const latency = Date.now() - start;
        console.log(`  Cerebras (llama-3.1-8b) latency: ${latency}ms`);
        expect(latency).toBeLessThan(TIMEOUT);
      }, TIMEOUT);
    }
  });

  describe('Google', () => {
    const provider = new GoogleProvider();

    it('should report availability based on API key', () => {
      const available = provider.isAvailable();
      console.log(`Google available: ${available}`);
      if (!available) console.log('  (GOOGLE_API_KEY not set - skipping live tests)');
    });

    if (provider.isAvailable()) {
      it('should return a response from gemini-2.0-flash-exp', async () => {
        const response = await provider.chat({
          model: 'gemini-2.0-flash-exp',
          messages: [TEST_MESSAGE],
          temperature: 0.1,
          maxTokens: 50,
          timeout: TIMEOUT,
        });
        expect(response).toBeDefined();
        expect(response.length).toBeGreaterThan(0);
      }, TIMEOUT);

      it('should handle math correctly', async () => {
        const response = await provider.chat({
          model: 'gemini-2.0-flash-exp',
          messages: [MATH_MESSAGE],
          temperature: 0,
          maxTokens: 10,
          timeout: TIMEOUT,
        });
        const cleanResponse = response.replace(/[^0-9]/g, '').trim();
        expect(cleanResponse).toBe('8');
      }, TIMEOUT);

      it('should benchmark latency', async () => {
        const start = Date.now();
        await provider.chat({
          model: 'gemini-2.0-flash-exp',
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: 0.1,
          maxTokens: 10,
          timeout: TIMEOUT,
        });
        const latency = Date.now() - start;
        console.log(`  Google (gemini-2.0-flash-exp) latency: ${latency}ms`);
        expect(latency).toBeLessThan(TIMEOUT);
      }, TIMEOUT);
    }
  });

  describe('OpenRouter', () => {
    const provider = new OpenRouterProvider();

    it('should report availability based on API key', () => {
      const available = provider.isAvailable();
      console.log(`OpenRouter available: ${available}`);
      if (!available) console.log('  (OPENROUTER_API_KEY not set - skipping live tests)');
    });

    if (provider.isAvailable()) {
      it('should return a response', async () => {
        const response = await provider.chat({
          model: 'google/gemma-3-27b-it:free',
          messages: [TEST_MESSAGE],
          temperature: 0.1,
          maxTokens: 50,
          timeout: TIMEOUT,
        });
        expect(response).toBeDefined();
      }, TIMEOUT);

      it('should benchmark latency', async () => {
        const start = Date.now();
        await provider.chat({
          model: 'google/gemma-3-27b-it:free',
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: 0.1,
          maxTokens: 10,
          timeout: TIMEOUT,
        });
        const latency = Date.now() - start;
        console.log(`  OpenRouter (gemma-3-27b-it:free) latency: ${latency}ms`);
        expect(latency).toBeLessThan(TIMEOUT);
      }, TIMEOUT);
    }
  });

  describe('Ollama', () => {
    const provider = new OllamaProvider();

    it('should report availability based on OLLAMA_ENABLED', () => {
      const enabled = process.env.OLLAMA_ENABLED !== 'false';
      const available = provider.isAvailable();
      console.log(`Ollama enabled: ${enabled}, available: ${available}`);
      if (!available) console.log('  (OLLAMA_ENABLED=false or OLLAMA_BASE_URL not reachable)');
    });

    if (provider.isAvailable()) {
      it('should test a model', async () => {
        // List models first
        try {
          const response = await provider.chat({
            model: 'llama3.2',
            messages: [{ role: 'user', content: 'Hi' }],
            temperature: 0.1,
            maxTokens: 10,
            timeout: 5000,
          });
          expect(response).toBeDefined();
          console.log(`  Ollama (llama3.2) works!`);
        } catch (e) {
          console.log(`  Ollama (llama3.2) failed: ${e.message}`);
          // Skip if model not found
          if (e.message.includes('not found')) {
            console.log('  (llama3.2 model not downloaded - run: ollama pull llama3.2)');
          }
          throw e;
        }
      }, 10000);
    }
  });
});

describe('AGENT_MODEL_CONFIG validation', () => {
  it('should have valid configuration for all agents', () => {
    const { AGENT_MODEL_CONFIG } = require('../../../src/core/models');
    
    for (const [agent, config] of Object.entries(AGENT_MODEL_CONFIG)) {
      expect(config.provider).toBeDefined();
      expect(config.primary).toBeDefined();
      expect(config.fallback).toBeDefined();
      console.log(`${agent}: ${config.provider}/${config.primary}`);
    }
  });
});