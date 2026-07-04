import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
    // Database
    DATABASE_URL: z.string().url(),

    // Redis
    REDIS_URL: z.string().url(),

    // JWT
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('7d'),

    // RSA
    RSA_PRIVATE_KEY: z.string().min(1),

    // Server
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // UAT Portal
    UAT_PORTAL_URL: z.string().url().default('https://administracionescolar.uat.edu.mx'),

    // Internal backend-apirest bridge
    BACKEND_API_REST_URL: z.string().url().default('http://localhost:3100'),

    // Shared internal API token for backend-apirest coordination calls
    INTERNAL_API_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('❌ Invalid environment variables:');
        console.error(result.error.flatten().fieldErrors);
        process.exit(1);
    }

    return result.data;
}

export const env = validateEnv();
