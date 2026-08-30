import { Prisma, type PrismaClient } from '../generated/prisma/index.js';
import type { IdentityRepository } from '../domain/identity.repository.js';
import type { Identity, ResolveVerifiedIdentityInput } from '../domain/identity.js';

export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveVerified(input: ResolveVerifiedIdentityInput): Promise<Identity> {
    const institutionalIdentifier = input.institutionalIdentifier.trim().toUpperCase();
    const email = input.email?.trim().toLowerCase() ?? null;
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.identity.findUnique({
        where: { kind_institutionalIdentifier: { kind: input.kind, institutionalIdentifier } },
      });
      const deviceBindingId = input.deviceId?.trim() || undefined;
      if (
        input.kind === 'PROFESSOR'
        && deviceBindingId
        && existing?.deviceBindingId
        && existing.deviceBindingId !== deviceBindingId
      ) {
        throw new Error('DEVICE_BINDING_CONFLICT');
      }
      const deviceFields = deviceBindingId ? {
        deviceBindingId,
        devicePlatform: input.devicePlatform?.trim().toLowerCase() || null,
        deviceInfo: input.deviceInfo?.trim() || null,
      } : {};
      const identity = existing
        ? await transaction.identity.update({
          where: { id: existing.id },
          data: {
            ...(input.email ? { email } : {}),
            ...(input.kind === 'STAFF' ? { role: input.role, disabledAt: null } : {}),
            ...deviceFields,
            displayName: input.displayName.trim(),
            lastAuthenticatedAt: new Date(),
          },
        })
        : await transaction.identity.create({
          data: {
          kind: input.kind,
          role: input.role,
          institutionalIdentifier,
          email,
          ...deviceFields,
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
          metadata: {
            kind: input.kind,
            ...(deviceBindingId ? {
              deviceBindingId,
              devicePlatform: input.devicePlatform?.trim().toLowerCase() || null,
              deviceInfo: input.deviceInfo?.trim() || null,
            } : {}),
          } as Prisma.InputJsonValue,
        },
      });
      return identity;
    });
  }

  findById(id: string): Promise<Identity | null> {
    return this.prisma.identity.findUnique({ where: { id } });
  }

  listRegisteredStudents(): Promise<Identity[]> {
    return this.prisma.identity.findMany({
      where: { kind: 'STUDENT', disabledAt: null },
      orderBy: [{ lastAuthenticatedAt: 'desc' }, { institutionalIdentifier: 'asc' }],
    });
  }

  listRegisteredProfessors(): Promise<Identity[]> {
    return this.prisma.identity.findMany({
      where: { kind: 'PROFESSOR', disabledAt: null },
      orderBy: [{ lastAuthenticatedAt: 'desc' }, { institutionalIdentifier: 'asc' }],
    });
  }

  findRegisteredStudentByMatricula(matricula: string): Promise<Identity | null> {
    return this.prisma.identity.findUnique({
      where: {
        kind_institutionalIdentifier: {
          kind: 'STUDENT',
          institutionalIdentifier: matricula.trim().toUpperCase(),
        },
      },
    });
  }

  async clearProfessorDeviceBinding(
    institutionalIdentifier: string,
    input: { actorIdentityId: string; correlationId: string; reason: string },
  ): Promise<string | null> {
    const identifier = institutionalIdentifier.trim().toUpperCase();
    return this.prisma.$transaction(async (transaction) => {
      const identity = await transaction.identity.findUnique({
        where: {
          kind_institutionalIdentifier: {
            kind: 'PROFESSOR',
            institutionalIdentifier: identifier,
          },
        },
      });
      if (!identity) return null;
      await transaction.identity.update({
        where: { id: identity.id },
        data: { deviceBindingId: null, devicePlatform: null, deviceInfo: null },
      });
      await transaction.securityAuditEvent.create({
        data: {
          identityId: identity.id,
          action: 'PROFESSOR_DEVICE_UNBOUND',
          source: 'COORDINATION',
          correlationId: input.correlationId,
          metadata: {
            actorIdentityId: input.actorIdentityId,
            reason: input.reason,
            previousDeviceBindingId: identity.deviceBindingId,
            previousDevicePlatform: identity.devicePlatform,
            previousDeviceInfo: identity.deviceInfo,
          } as Prisma.InputJsonValue,
        },
      });
      return identity.id;
    });
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

  async purgeAllIdentities(): Promise<string[]> {
    return this.prisma.$transaction(async (transaction) => {
      const identities = await transaction.identity.findMany({ select: { id: true } });
      const ids = identities.map(({ id }) => id);
      await transaction.securityAuditEvent.deleteMany();
      await transaction.identity.deleteMany();
      return ids;
    });
  }
}
