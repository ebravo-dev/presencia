import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Identity, IdentityRole } from '../domain/identity.js';

export interface IdentityTokenClaims extends JwtPayload {
  sub: string;
  sessionId: string;
  role: IdentityRole;
  kind: Identity['kind'];
}

export class IdentityTokenService {
  constructor(
    private readonly activeSecret: string,
    private readonly previousSecret: string | undefined,
    private readonly issuer: string,
    private readonly audience: string,
    private readonly ttlSeconds: number,
  ) {}

  sign(identity: Identity, sessionId: string): string {
    return jwt.sign(
      { sessionId, role: identity.role, kind: identity.kind },
      this.activeSecret,
      {
        algorithm: 'HS256',
        subject: identity.id,
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: this.ttlSeconds,
      },
    );
  }

  verify(token: string): IdentityTokenClaims {
    const secrets = [this.activeSecret, this.previousSecret].filter((value): value is string => Boolean(value));
    let lastError: unknown;
    for (const secret of secrets) {
      try {
        const claims = jwt.verify(token, secret, {
          algorithms: ['HS256'],
          issuer: this.issuer,
          audience: this.audience,
        });
        if (typeof claims === 'string' || !claims.sub || typeof claims.sessionId !== 'string') {
          throw new Error('Invalid identity token claims.');
        }
        return claims as IdentityTokenClaims;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Invalid identity token.');
  }
}
