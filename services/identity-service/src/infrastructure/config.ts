import { z } from 'zod';

const developmentSecrets = new Set([
  'development-identity-jwt-secret-change-me',
  'development-internal-service-token-change-me',
  'development-metrics-token-change-me',
]);

export const identityEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3200),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/presencia_identity?schema=public'),
  REDIS_URL: z.url().default('redis://localhost:6379/1'),
  IDENTITY_JWT_SECRET: z.string().min(32).default('development-identity-jwt-secret-change-me'),
  IDENTITY_JWT_PREVIOUS_SECRET: z.string().min(32).optional(),
  IDENTITY_JWT_ISSUER: z.string().min(1).default('presencia-identity'),
  IDENTITY_JWT_AUDIENCE: z.string().min(1).default('presencia-apps'),
  IDENTITY_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
  INTERNAL_API_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
  METRICS_TOKEN: z.string().min(32).default('development-metrics-token-change-me'),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;
  for (const [field, secret] of [
    ['IDENTITY_JWT_SECRET', value.IDENTITY_JWT_SECRET],
    ['INTERNAL_API_TOKEN', value.INTERNAL_API_TOKEN],
    ['METRICS_TOKEN', value.METRICS_TOKEN],
  ] as const) {
    if (developmentSecrets.has(secret)) context.addIssue({ code: 'custom', path: [field], message: 'Production secret is required' });
  }
  const secrets = [value.IDENTITY_JWT_SECRET, value.INTERNAL_API_TOKEN, value.METRICS_TOKEN];
  if (new Set(secrets).size !== secrets.length) {
    context.addIssue({ code: 'custom', path: ['IDENTITY_JWT_SECRET'], message: 'Identity, internal and metrics secrets must be distinct' });
  }
});

export type IdentityEnv = z.infer<typeof identityEnvSchema>;
export const loadIdentityEnv = (source: NodeJS.ProcessEnv = process.env): IdentityEnv => identityEnvSchema.parse(source);
