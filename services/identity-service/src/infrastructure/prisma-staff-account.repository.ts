import type { PrismaClient } from '../generated/prisma/index.js';
import type {
  CreateStaffAccountInput,
  StaffAccount,
  StaffAccountRepository,
  StaffAuditContext,
  StaffCredential,
  UpdateStaffAccountInput,
} from '../domain/staff-account.repository.js';

const staffAccountInclude = { identity: true } as const;

export class PrismaStaffAccountRepository implements StaffAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findCredentialByEmail(email: string): Promise<StaffCredential | null> {
    const row = await this.prisma.staffCredential.findUnique({
      where: { email: normalizeEmail(email) },
      include: staffAccountInclude,
    });
    return row ? { ...toAccount(row), passwordHash: row.passwordHash } : null;
  }

  async list(): Promise<StaffAccount[]> {
    const rows = await this.prisma.staffCredential.findMany({
      include: staffAccountInclude,
      orderBy: [{ identity: { displayName: 'asc' } }, { email: 'asc' }],
    });
    return rows.map(toAccount);
  }

  async create(input: CreateStaffAccountInput): Promise<StaffAccount> {
    return this.prisma.$transaction(async (transaction) => {
      const email = normalizeEmail(input.email);
      const identity = await transaction.identity.create({
        data: {
          kind: 'STAFF', role: input.role, institutionalIdentifier: email,
          email, displayName: input.name.trim(), disabledAt: input.disabled ? new Date() : null,
          lastAuthenticatedAt: new Date(0),
        },
      });
      const row = await transaction.staffCredential.create({
        data: {
          identityId: identity.id, email, passwordHash: input.passwordHash,
          legacySourceId: input.legacySourceId ?? null,
        },
        include: staffAccountInclude,
      });
      await transaction.securityAuditEvent.create({ data: auditEvent(
        identity.id, 'STAFF_ACCOUNT_CREATED', input.audit,
      ) });
      return toAccount(row);
    });
  }

  async update(id: string, input: UpdateStaffAccountInput): Promise<StaffAccount> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.staffCredential.findUniqueOrThrow({ where: { id } });
      const email = input.email ? normalizeEmail(input.email) : undefined;
      await transaction.identity.update({
        where: { id: current.identityId },
        data: {
          ...(email ? { email, institutionalIdentifier: email } : {}),
          ...(input.name ? { displayName: input.name.trim() } : {}),
          ...(input.role ? { role: input.role } : {}),
          ...(input.disabled === undefined ? {} : { disabledAt: input.disabled ? new Date() : null }),
        },
      });
      const row = await transaction.staffCredential.update({
        where: { id },
        data: {
          ...(email ? { email } : {}),
          ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
        },
        include: staffAccountInclude,
      });
      await transaction.securityAuditEvent.create({ data: auditEvent(
        current.identityId, 'STAFF_ACCOUNT_UPDATED', input.audit,
      ) });
      return toAccount(row);
    });
  }

  async delete(id: string, audit: StaffAuditContext): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.staffCredential.findUniqueOrThrow({ where: { id } });
      await transaction.securityAuditEvent.create({ data: auditEvent(
        current.identityId, 'STAFF_ACCOUNT_DELETED', audit,
      ) });
      await transaction.identity.delete({ where: { id: current.identityId } });
    });
  }

  async import(input: CreateStaffAccountInput & { legacySourceId: string }): Promise<StaffAccount> {
    const imported = await this.prisma.staffCredential.findUnique({
      where: { legacySourceId: input.legacySourceId },
      include: staffAccountInclude,
    });
    if (imported) return toAccount(imported);
    const existing = await this.prisma.staffCredential.findUnique({
      where: { email: normalizeEmail(input.email) },
      include: staffAccountInclude,
    });
    if (!existing) return this.create(input);
    const adopted = await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.staffCredential.update({
        where: { id: existing.id }, data: { legacySourceId: input.legacySourceId }, include: staffAccountInclude,
      });
      await transaction.securityAuditEvent.create({ data: auditEvent(
        existing.identityId, 'STAFF_ACCOUNT_ADOPTED', input.audit,
      ) });
      return row;
    });
    return toAccount(adopted);
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function toAccount(row: {
  id: string;
  identityId: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  identity: { displayName: string; role: string; disabledAt: Date | null };
}): StaffAccount {
  if (row.identity.role !== 'COORDINATOR' && row.identity.role !== 'READ_ONLY') {
    throw new Error('INVALID_STAFF_ROLE');
  }
  return {
    id: row.id,
    identityId: row.identityId,
    email: row.email,
    name: row.identity.displayName,
    role: row.identity.role,
    disabledAt: row.identity.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function auditEvent(identityId: string, action: string, audit: StaffAuditContext) {
  return {
    identityId,
    action,
    source: audit.source,
    correlationId: audit.correlationId,
    metadata: { actorIdentityId: audit.actorIdentityId, reason: audit.reason },
  };
}
