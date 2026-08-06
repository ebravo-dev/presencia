import { z } from 'zod';
import 'dotenv/config';

const DEVELOPMENT_SECRETS = new Set([
    'development-super-user-password',
    'development-internal-service-token-change-me',
]);
const DEVELOPMENT_CORS_ORIGINS = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
]);

export const envSchema = z.object({
    // Database
    DATABASE_URL: z.string().url(),

    // Redis
    REDIS_URL: z.string().url(),

    // JWT
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('7d'),
    SUPER_USER_PASSWORD: z.string().min(12).default('development-super-user-password'),

    // RSA
    RSA_PRIVATE_KEY: z.string().min(1),

    // Server
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    APP_TIME_ZONE: z.string().default('America/Mexico_City'),
    CORS_ALLOWED_ORIGINS: z.string()
        .default('http://localhost:3000,http://localhost:5173')
        .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
    PRESENCIA_DEBUG_MODE: z.preprocess(
        (value) => value === undefined || value === '' ? undefined : value === true || value === 'true',
        z.boolean().default(false),
    ),
    PRESENCIA_DEBUG_VERBOSE_LOGS: z.preprocess(
        (value) => value === undefined || value === '' ? undefined : value === true || value === 'true',
        z.boolean().default(false),
    ),
    PRESENCIA_DEBUG_PERIOD: z.string().default('2026 - 3 OTOÑO'),
    PRESENCIA_DEBUG_CLASS_HOURS: z.coerce.number().int().positive().default(4),
    DEBUG_EXTRA_CLASS_HOURS: z.coerce.number().int().positive().default(4),

    // UAT Portal
    UAT_PORTAL_URL: z.string().url().default('https://administracionescolar.uat.edu.mx'),
    UAT_ID_CICLO_ESCOLAR: z.coerce.number().int().positive().default(152),
    UAT_ID_DES: z.coerce.number().int().positive().default(12),

    // Internal backend-apirest bridge
    BACKEND_API_REST_URL: z.string().url().default('http://localhost:3100'),

    // Authoritative device-binding commands during the strangler migration
    ATTENDANCE_SERVICE_URL: z.string().url().optional(),
    ATTENDANCE_SERVICE_REQUIRED: z.preprocess(
        (value) => value === undefined || value === '' ? undefined : value === true || value === 'true',
        z.boolean().default(false),
    ),

    // Shared internal API token for backend-apirest coordination calls
    INTERNAL_API_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
}).superRefine((value, ctx) => {
    if (value.ATTENDANCE_SERVICE_REQUIRED && !value.ATTENDANCE_SERVICE_URL) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ATTENDANCE_SERVICE_URL'],
            message: 'Must be configured when ATTENDANCE_SERVICE_REQUIRED=true',
        });
    }
    if (value.NODE_ENV !== 'production') return;

    if (DEVELOPMENT_SECRETS.has(value.SUPER_USER_PASSWORD)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SUPER_USER_PASSWORD'],
            message: 'Must be configured with a non-development value in production',
        });
    }

    if (DEVELOPMENT_SECRETS.has(value.INTERNAL_API_TOKEN)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['INTERNAL_API_TOKEN'],
            message: 'Must be configured with a non-development value in production',
        });
    }

    if (value.JWT_SECRET === value.INTERNAL_API_TOKEN) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['INTERNAL_API_TOKEN'],
            message: 'Must be different from JWT_SECRET',
        });
    }

    if (value.CORS_ALLOWED_ORIGINS.length === 0
        || value.CORS_ALLOWED_ORIGINS.every((origin) => DEVELOPMENT_CORS_ORIGINS.has(origin))) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['CORS_ALLOWED_ORIGINS'],
            message: 'At least one non-local browser origin is required in production',
        });
    }

    if (value.PRESENCIA_DEBUG_MODE) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['PRESENCIA_DEBUG_MODE'],
            message: 'Debug mode cannot be enabled in production',
        });
    }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
    const result = envSchema.safeParse(source);

    if (!result.success) {
        console.error('❌ Invalid environment variables:');
        console.error(result.error.flatten().fieldErrors);
        process.exit(1);
    }

    return result.data;
}

export const env = validateEnv();
