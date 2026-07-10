import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';

export interface CoordinatorIdentity { id: string; email: string; name: string; role: string }
interface CoordinatorJwtPayload extends jwt.JwtPayload { sub: string; jti: string; email: string; role: string }

export class CoordinatorAuthService {
  private readonly sessionDurationSeconds = 8 * 60 * 60;

  constructor(private readonly prisma: PrismaClient, private readonly jwtSecret: string) {}

  async login(email: string, password: string): Promise<{ token: string; user: CoordinatorIdentity; expiresAt: Date }> {
    const user = await this.prisma.coordinatorUser.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || user.disabledAt || !(await argon2.verify(user.passwordHash, password))) {
      throw new Error('INVALID_COORDINATOR_CREDENTIALS');
    }
    await this.prisma.coordinatorSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + this.sessionDurationSeconds * 1000);
    await this.prisma.coordinatorSession.create({ data: { id: sessionId, userId: user.id, expiresAt } });
    const token = jwt.sign({ email: user.email, role: user.role }, this.jwtSecret, {
      subject: user.id, jwtid: sessionId, expiresIn: this.sessionDurationSeconds, issuer: 'presencia-backend-apirest',
    });
    return { token, expiresAt, user: toIdentity(user) };
  }

  async authenticate(token?: string): Promise<CoordinatorIdentity | null> {
    if (!token) return null;
    try {
      const payload = jwt.verify(token, this.jwtSecret, { issuer: 'presencia-backend-apirest' }) as CoordinatorJwtPayload;
      if (!payload.sub || !payload.jti || !['COORDINATOR', 'READ_ONLY'].includes(payload.role)) return null;
      const session = await this.prisma.coordinatorSession.findUnique({ where: { id: payload.jti }, include: { user: true } });
      if (!session || session.expiresAt <= new Date() || session.user.disabledAt) return null;
      return toIdentity(session.user);
    } catch { return null; }
  }

  async logout(token?: string): Promise<void> {
    if (!token) return;
    const decoded = jwt.decode(token) as CoordinatorJwtPayload | null;
    if (decoded?.jti) await this.prisma.coordinatorSession.deleteMany({ where: { id: decoded.jti } });
  }
}

function toIdentity(user: { id: string; email: string; name: string; role: string }): CoordinatorIdentity {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
