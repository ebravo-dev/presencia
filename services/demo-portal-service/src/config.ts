import { z } from 'zod';

const booleanValue = z.preprocess(
  (value) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : value,
  z.boolean(),
);

export const demoPortalEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3900),
  PRESENCIA_DEBUG_MODE: booleanValue.default(false),
  REDIS_URL: z.string().url().default('redis://localhost:6379/0'),
  INTERNAL_API_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
  DEMO_SESSION_SECRET: z.string().min(32).default('development-demo-session-secret-change-me'),
  PRESENCIA_DEMO_DEFAULT_PASSWORD: z.string().min(8).max(128).default('presencia-demo-local'),
  PRESENCIA_DEMO_SEED: booleanValue.default(true),
  PRESENCIA_DEMO_CYCLE_ID: z.coerce.number().int().positive().default(152),
  PRESENCIA_DEMO_CYCLE_NAME: z.string().trim().min(1).max(120).default('2026-3'),
  PRESENCIA_DEMO_COORDINATION_ID: z.coerce.number().int().positive().default(12),
  PRESENCIA_DEMO_COORDINATION_NAME: z.string().trim().min(1).max(160).default('Coordinación Demo'),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;
  for (const [field, secret] of [
    ['INTERNAL_API_TOKEN', value.INTERNAL_API_TOKEN],
    ['DEMO_SESSION_SECRET', value.DEMO_SESSION_SECRET],
  ] as const) {
    if (secret.startsWith('development-')) {
      context.addIssue({ code: 'custom', path: [field], message: 'Production demo secrets must be configured' });
    }
  }
  if (value.INTERNAL_API_TOKEN === value.DEMO_SESSION_SECRET) {
    context.addIssue({ code: 'custom', path: ['DEMO_SESSION_SECRET'], message: 'Demo session secret must be distinct' });
  }
});

export type DemoPortalEnv = z.infer<typeof demoPortalEnvSchema>;
export const loadDemoPortalEnv = (source: NodeJS.ProcessEnv = process.env): DemoPortalEnv => demoPortalEnvSchema.parse(source);
