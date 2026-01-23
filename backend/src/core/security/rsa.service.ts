import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * RSA Service for decrypting passwords encrypted by Flutter app
 * Uses RSA-OAEP with SHA-256 padding (compatible with Flutter encrypt package)
 */
export class RSAService {
    private privateKey: string;

    constructor() {
        // Decode base64-encoded private key from environment
        this.privateKey = this.decodePrivateKey(env.RSA_PRIVATE_KEY);
    }

    private decodePrivateKey(encodedKey: string): string {
        // If it starts with -----BEGIN, it's already in PEM format
        if (encodedKey.startsWith('-----BEGIN')) {
            return encodedKey;
        }
        // Otherwise, decode from base64
        return Buffer.from(encodedKey, 'base64').toString('utf-8');
    }

    /**
     * Decrypt password encrypted with RSA-OAEP SHA-256
     * Compatible with Flutter's encrypt package using:
     * - RSA_PKCS1_OAEP_PADDING
     * - oaepHash: 'sha256'
     */
    decryptPassword(encryptedBase64: string): string {
        try {
            const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');

            const decrypted = crypto.privateDecrypt(
                {
                    key: this.privateKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: 'sha256',
                },
                encryptedBuffer
            );

            return decrypted.toString('utf-8');
        } catch (error) {
            console.error('RSA decryption failed:', error);
            throw new Error('Failed to decrypt password');
        }
    }

    /**
     * Verify that the RSA service is properly configured
     */
    verify(): boolean {
        try {
            // Try to create a key object to verify the private key is valid
            crypto.createPrivateKey(this.privateKey);
            return true;
        } catch {
            return false;
        }
    }
}

// Singleton instance
export const rsaService = new RSAService();
