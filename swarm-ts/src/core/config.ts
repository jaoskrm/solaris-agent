import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  
  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
  
  NEO4J_URI: z.string().optional(),
  NEO4J_USERNAME: z.string().optional(),
  NEO4J_PASSWORD: z.string().optional(),
  
  SUPABASE_URL: z.string(),
  SUPABASE_ANON_KEY: z.string(),
  
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5-coder:14b'),
  
  AUTHORIZATION_HMAC_SECRET: z.string().optional(),
  CREDENTIAL_VAULT_KEY: z.string().optional(),
})

export type EnvConfig = z.infer<typeof envSchema>

let config: EnvConfig | null = null

export function loadConfig(): EnvConfig {
  if (config) return config
  
  const result = envSchema.safeParse(process.env)
  
  if (!result.success) {
    console.error('Invalid environment configuration:', result.error.flatten())
    throw new Error('Configuration validation failed')
  }
  
  config = result.data
  return config
}

export function getConfig(): EnvConfig {
  if (!config) {
    return loadConfig()
  }
  return config
}

if (process.env.NODE_ENV !== 'test') {
  loadConfig()
}
