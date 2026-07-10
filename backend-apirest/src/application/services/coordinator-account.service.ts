import argon2 from 'argon2';
import type { PrismaClient } from '@prisma/client';

export interface CoordinatorAccountInput {
  email: string;
  name: string;
  password: string;
  role?: string;
}

export interface CoordinatorAccountUpdateInput {
  email?: string;
  name?: string;
  password?: string;
  role?: string;
  disabled?: boolean;
}

export class CoordinatorAccountService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCoordinators() {
    const users = await this.prisma.coordinatorUser.findMany({
      orderBy: [{ disabledAt: 'asc' }, { name: 'asc' }],
      select: coordinatorSelect,
    });

    return {
      data: users.map((user) => ({ ...user, disabled: user.disabledAt != null })),
      meta: { generatedAt: new Date().toISOString() },
    };
  }

  async createCoordinator(input: CoordinatorAccountInput) {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await this.prisma.coordinatorUser.create({
      data: {
        email: normalizeEmail(input.email),
        name: input.name.trim(),
        passwordHash,
        role: normalizeRole(input.role),
      },
      select: coordinatorSelect,
    });

    return { data: { ...user, disabled: user.disabledAt != null } };
  }

  async updateCoordinator(id: string, input: CoordinatorAccountUpdateInput) {
    const data: Record<string, unknown> = {};
    if (input.email !== undefined) data.email = normalizeEmail(input.email);
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.role !== undefined) data.role = normalizeRole(input.role);
    if (input.password !== undefined && input.password.trim() !== '') {
      data.passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    }
    if (input.disabled !== undefined) {
      data.disabledAt = input.disabled ? new Date() : null;
      if (input.disabled) {
        await this.prisma.coordinatorSession.deleteMany({ where: { userId: id } });
      }
    }

    const user = await this.prisma.coordinatorUser.update({
      where: { id },
      data,
      select: coordinatorSelect,
    });

    return { data: { ...user, disabled: user.disabledAt != null } };
  }

  async deleteCoordinator(id: string): Promise<void> {
    await this.prisma.coordinatorUser.delete({ where: { id } });
  }
}

const coordinatorSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  disabledAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeRole(role?: string): string {
  const value = role?.trim().toUpperCase();
  return value === 'READ_ONLY' ? 'READ_ONLY' : 'COORDINATOR';
}
