import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JWTPayload {
    professorId: string;
    email: string;
}

export class JWTService {
    private secret: string;
    private expiresIn: string;

    constructor() {
        this.secret = env.JWT_SECRET;
        this.expiresIn = env.JWT_EXPIRES_IN;
    }

    /**
     * Generate a JWT token for a professor
     */
    sign(payload: JWTPayload): string {
        const options: SignOptions = {
            expiresIn: this.expiresIn as jwt.SignOptions['expiresIn'],
        };
        return jwt.sign(payload, this.secret, options);
    }

    /**
     * Verify and decode a JWT token
     */
    verify(token: string): JWTPayload {
        try {
            const decoded = jwt.verify(token, this.secret) as JWTPayload;
            return decoded;
        } catch {
            throw new Error('Invalid or expired token');
        }
    }

    /**
     * Decode a JWT token without verifying (for debugging)
     */
    decode(token: string): JWTPayload | null {
        const decoded = jwt.decode(token);
        return decoded as JWTPayload | null;
    }
}

// Singleton instance
export const jwtService = new JWTService();
