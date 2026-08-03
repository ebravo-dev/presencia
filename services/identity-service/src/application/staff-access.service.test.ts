import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import type {
  CreateStaffAccountInput,
  StaffAccount,
  StaffAccountRepository,
  StaffCredential,
  UpdateStaffAccountInput,
} from '../domain/staff-account.repository.js';
import { StaffAccessService } from './staff-access.service.js';

describe('StaffAccessService', () => {
  it('verifies local credentials and delegates session issuance to Identity', async () => {
    const repository = new FakeStaffRepository();
    await repository.create({
      email: 'coord@uat.edu.mx', name: 'Coordinación', role: 'COORDINATOR',
      passwordHash: await argon2.hash('strong-password'),
      audit,
    });
    const calls: unknown[] = [];
    const service = new StaffAccessService(repository, {
      create: async (input: unknown, ttlMs: number) => {
        calls.push({ input, ttlMs });
        return {
          identity: { id: 'identity-1' }, sessionId: 'session-1', accessToken: 'token',
          expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        };
      },
    } as never, 'a-super-user-password', 28_800_000, 14_400_000);

    const result = await service.login('COORD@UAT.EDU.MX', 'strong-password', 'request-1');

    expect(result.user).toMatchObject({ email: 'coord@uat.edu.mx', role: 'COORDINATOR' });
    expect(calls).toEqual([expect.objectContaining({ ttlMs: 28_800_000 })]);
    await expect(service.login('coord@uat.edu.mx', 'wrong', 'request-2')).rejects.toThrow('INVALID_STAFF_CREDENTIALS');
  });

  it('uses a constant-time comparison boundary before issuing a super-user session', async () => {
    const service = new StaffAccessService(new FakeStaffRepository(), {
      create: async () => ({
        identity: { id: 'super-user' }, sessionId: 'session-super', accessToken: 'token-super', expiresAt: new Date().toISOString(),
      }),
    } as never, 'a-super-user-password', 28_800_000, 14_400_000);

    await expect(service.loginSuperUser('wrong', 'request-1')).rejects.toThrow('INVALID_SUPER_USER_PASSWORD');
    await expect(service.loginSuperUser('a-super-user-password', 'request-2')).resolves.toMatchObject({
      user: { role: 'SUPER_USER' }, accessToken: 'token-super',
    });
  });

  it('imports legacy password hashes idempotently', async () => {
    const repository = new FakeStaffRepository();
    const service = new StaffAccessService(repository, {} as never, 'a-super-user-password', 1, 1);
    const passwordHash = await argon2.hash('legacy-password');
    const account = {
      legacySourceId: 'legacy-1', email: 'coord@uat.edu.mx', name: 'Original',
      passwordHash, role: 'COORDINATOR' as const,
    };

    await service.import([account], audit);
    await service.import([{ ...account, name: 'Actualizado' }], audit);

    expect(await service.list()).toEqual([expect.objectContaining({ name: 'Original' })]);
  });
});

class FakeStaffRepository implements StaffAccountRepository {
  private readonly rows = new Map<string, StaffCredential>();

  async findCredentialByEmail(email: string) {
    return [...this.rows.values()].find((row) => row.email === email.trim().toLowerCase()) ?? null;
  }

  async list() {
    return [...this.rows.values()];
  }

  async create(input: CreateStaffAccountInput) {
    const now = new Date();
    const row: StaffCredential = {
      id: input.legacySourceId ?? `staff-${this.rows.size + 1}`,
      identityId: `identity-${this.rows.size + 1}`,
      email: input.email.trim().toLowerCase(),
      name: input.name,
      role: input.role,
      disabledAt: input.disabled ? now : null,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async update(id: string, input: UpdateStaffAccountInput) {
    const current = this.rows.get(id);
    if (!current) throw new Error('missing');
    const updated: StaffCredential = {
      ...current,
      ...(input.email ? { email: input.email.trim().toLowerCase() } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
      ...(input.disabled === undefined ? {} : { disabledAt: input.disabled ? new Date() : null }),
      updatedAt: new Date(),
    };
    this.rows.set(id, updated);
    return updated;
  }

  async delete(id: string) {
    this.rows.delete(id);
  }

  async import(input: CreateStaffAccountInput & { legacySourceId: string }): Promise<StaffAccount> {
    const existing = this.rows.get(input.legacySourceId);
    return existing ?? this.create(input);
  }
}

const audit = {
  actorIdentityId: 'identity-super', correlationId: 'request-1',
  reason: 'Prueba de administración.', source: 'SUPER_USER' as const,
};
