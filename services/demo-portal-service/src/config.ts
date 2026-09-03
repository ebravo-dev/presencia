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
  PRESENCIA_APP_REVIEW_ENABLED: booleanValue.default(false),
  PRESENCIA_APP_REVIEW_TEACHER_USERNAME: z.email().default('appreview.profesor@uat.edu.mx').transform((value) => value.trim().toLowerCase()),
  PRESENCIA_APP_REVIEW_STUDENT_USERNAME: z.email().default('appreview.alumno@alumnos.uat.edu.mx').transform((value) => value.trim().toLowerCase()),
  PRESENCIA_APP_REVIEW_TEACHER_PASSWORD: z.string().max(128).default(''),
  PRESENCIA_APP_REVIEW_STUDENT_PASSWORD: z.string().max(128).default(''),
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
  if (value.PRESENCIA_APP_REVIEW_ENABLED) {
    for (const passwordKey of [
      'PRESENCIA_APP_REVIEW_TEACHER_PASSWORD',
      'PRESENCIA_APP_REVIEW_STUDENT_PASSWORD',
    ] as const) {
      if (value[passwordKey].length < 12) {
        context.addIssue({
          code: 'custom',
          path: [passwordKey],
          message: `${passwordKey} must contain at least 12 characters when App Review access is enabled`,
        });
      }
    }
  }
  if (value.PRESENCIA_APP_REVIEW_TEACHER_USERNAME === value.PRESENCIA_APP_REVIEW_STUDENT_USERNAME) {
    context.addIssue({
      code: 'custom',
      path: ['PRESENCIA_APP_REVIEW_STUDENT_USERNAME'],
      message: 'Teacher and student App Review usernames must be different',
    });
  }
  if (
    value.PRESENCIA_APP_REVIEW_ENABLED
    && value.PRESENCIA_APP_REVIEW_TEACHER_PASSWORD === value.PRESENCIA_APP_REVIEW_STUDENT_PASSWORD
  ) {
    context.addIssue({
      code: 'custom',
      path: ['PRESENCIA_APP_REVIEW_STUDENT_PASSWORD'],
      message: 'Teacher and student App Review passwords must be different',
    });
  }
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
