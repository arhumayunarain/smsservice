import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  ADMIN_USERNAME: z.string().min(1, 'ADMIN_USERNAME is required').optional(),
  ADMIN_PASSWORD: z.string().min(1, 'ADMIN_PASSWORD is required').optional(),
  ENCRYPTION_KEY: z.string().optional().default('cb1efbd508db5dc3a5f29c39552fa2ca963bb1baa3c9d02980f6a4b638502e6c'),
  // Outreach SMS API (optional — API sending disabled if not set)
  OUTREACH_API_ID: z.string().optional(),
  OUTREACH_API_PASS: z.string().optional(),
  OUTREACH_MASK: z.string().optional().default('Outreach'),
  // Google OAuth (optional — Sheets feature disabled if not set)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Leopards Courier API (optional — Leopards import disabled if not set)
  LEOPARDS_KEY: z.string().optional(),
  LEOPARDS_KEY_PASSWORD: z.string().optional(),
  LEOPARDS_KEY_2: z.string().optional(),
  LEOPARDS_KEY_PASSWORD_2: z.string().optional(),
  // API base URL for OAuth callbacks (default: localhost:3000)
  API_BASE_URL: z.string().optional().default('http://localhost:3000'),
  // Dashboard URL for OAuth redirect after consent (default: localhost:3001)
  DASHBOARD_URL: z.string().optional().default('http://localhost:3001'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}
