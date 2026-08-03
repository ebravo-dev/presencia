import { Prisma, type PrismaClient } from '../generated/prisma/index.js';
import type { IdentityRepository } from '../domain/identity.repository.js';
import type { Identity, ResolveVerifiedIdentityInput } from '../domain/identity.js';

export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveVerified(input: ResolveVerifiedIdentityInput): Promise<Identity> {
    const institutionalIdentifier = input.institutionalIdentifier.trim().toUpperCase();
    const email = input.email?.trim().toLowerCase() ?? null;
    return this.prisma.$transaction(async (transaction) => {
      const identity = await transaction.identity.upsert({
        where: { kind_institutionalIdentifier: { kind: input.kind, institutionalIdentifier } },
        create: {
          kind: input.kind,
          role: input.role,
          institutionalIdentifier,
          email,
          displayName: input.displayName.trim(),
          lastAuthenticatedAt: new Date(),
        },
        update: {
          ...(input.email ? { email } : {}),
          ...(input.kind === 'STAFF' ? { role: input.role, disabledAt: null } : {}),
          displayName: input.displayName.trim(),
          lastAuthenticatedAt: new Date(),
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          identityId: identity.id,
          action: 'IDENTITY_AUTHENTICATED',
          source: input.source,
          correlationId: input.correlationId,
          metadata: { kind: input.kind } as Prisma.InputJsonValue,
        },
      });
      return identity;
    });
  }

  findById(id: string): Promise<Identity | null> {
    return this.prisma.identity.findUnique({ where: { id } });
  }

  async resetDemoIdentities(): Promise<string[]> {
    return this.prisma.$transaction(async (transaction) => {
      const identities = await transaction.identity.findMany({
        where: { kind: { in: ['PROFESSOR', 'STUDENT'] } },
        select: { id: true },
      });
      const ids = identities.map(({ id }) => id);
      if (ids.length === 0) return [];
      await transaction.securityAuditEvent.deleteMany({ where: { identityId: { in: ids } } });
      await transaction.identity.deleteMany({ where: { id: { in: ids } } });
      return ids;
    });
  }
}
