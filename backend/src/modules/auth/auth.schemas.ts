import { z } from 'zod';

/**
 * Login request schema
 */
export const loginSchema = z.object({
    institutionalEmail: z.string().email('Email inválido'),
    encryptedPassword: z.string().min(1, 'Contraseña requerida'),
});

export type LoginRequest = z.infer<typeof loginSchema>;

/**
 * Auth response (includes period info)
 */
export interface AuthResponse {
    token: string;
    profesor: {
        id: string;
        institutionalEmail: string;
        name: string;
    };
    message: string;
    currentPeriod: string;  // e.g. "Primavera 2026"
    needsSync: boolean;     // true if scraping was triggered
}

/**
 * Error response
 */
export interface ErrorResponse {
    statusCode: number;
    error: string;
    message: string;
}
