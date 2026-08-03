import { timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { StaffAccountRepository, StaffAuditContext, StaffRole } from '../domain/staff-account.repository.js';
import type { AuthenticatedSessionService } from './authenticated-session.service.js';

export interface StaffAccountInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly role?: StaffRole | undefined;
}

export interface StaffAccountUpdateInput {
  readonly email?: string | undefined;
  readonly name?: string | undefined;
  readonly password?: string | undefined;
  readonly role?: StaffRole | undefined;
  readonly disabled?: boolean | undefined;
}

export interface StaffAccountImportInput {
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly legacySourceId: string;
  readonly role?: StaffRole | undefined;
  readonly disabled?: boolean | undefined;
}

export class StaffAccessService {
  constructor(
    private readonly accounts: StaffAccountRepository,
    private readonly sessions: AuthenticatedSessionService,
    private readonly superUserPassword: string,
    private readonly staffSessionTtlMs: number,
    private readonly superUserSessionTtlMs: number,
  ) {}

  async login(email: string, password: string, correlationId: string) {
    const account = await this.accounts.findCredentialByEmail(email);
    if (!account || account.disabledAt || !(await argon2.verify(account.passwordHash, password))) {
      throw new Error('INVALID_STAFF_CREDENTIALS');
    }
    const session = await this.sessions.create({
      kind: 'STAFF', role: account.role, institutionalIdentifier: account.email,
      email: account.email, displayName: account.name, source: 'LOCAL_STAFF', correlationId,
    }, this.staffSessionTtlMs);
    return { ...session, user: toUser(account) };
  }

  async loginSuperUser(password: string, correlationId: string) {
    if (!safeEquals(password, this.superUserPassword)) throw new Error('INVALID_SUPER_USER_PASSWORD');
    const session = await this.sessions.create({
      kind: 'STAFF', role: 'SUPER_USER', institutionalIdentifier: 'SUPER_USER',
      displayName: 'Super usuario', source: 'SUPER_USER', correlationId,
    }, this.superUserSessionTtlMs);
    return { ...session, user: { role: 'SUPER_USER' as const } };
  }

  list() {
    return this.accounts.list().then((accounts) => accounts.map(toUser));
  }

  async create(input: StaffAccountInput, audit: StaffAuditContext) {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    return toUser(await this.accounts.create({ ...input, role: input.role ?? 'COORDINATOR', passwordHash, audit }));
  }

  async update(id: string, input: StaffAccountUpdateInput, audit: StaffAuditContext) {
    const passwordHash = input.password ? await argon2.hash(input.password, { type: argon2.argon2id }) : undefined;
    return toUser(await this.accounts.update(id, {
      ...(input.email ? { email: input.email } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(passwordHash ? { passwordHash } : {}),
      ...(input.disabled === undefined ? {} : { disabled: input.disabled }),
      audit,
    }));
  }

  delete(id: string, audit: StaffAuditContext) {
    return this.accounts.delete(id, audit);
  }

  async import(accounts: StaffAccountImportInput[], audit: StaffAuditContext) {
    const imported = [];
    for (const account of accounts) {
      imported.push(toUser(await this.accounts.import({
        email: account.email, name: account.name, role: account.role ?? 'COORDINATOR',
        passwordHash: account.passwordHash, legacySourceId: account.legacySourceId,
        disabled: account.disabled,
        audit,
      })));
    }
    return imported;
  }
}

function safeEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function toUser(account: { id: string; identityId: string; email: string; name: string; role: StaffRole; disabledAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return {
    id: account.id, identityId: account.identityId, email: account.email, name: account.name,
    role: account.role, disabled: Boolean(account.disabledAt),
    createdAt: account.createdAt, updatedAt: account.updatedAt,
  };
}
