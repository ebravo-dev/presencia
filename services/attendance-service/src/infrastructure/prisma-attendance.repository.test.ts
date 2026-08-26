import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaAttendanceRepository } from './prisma-attendance.repository.js';

describe('PrismaAttendanceRepository roster transaction retry', () => {
  it('retries roster writes after serialization and unique races', async () => {
    const transaction = vi.fn()
      .mockRejectedValueOnce(prismaError('P2034'))
      .mockRejectedValueOnce(prismaError('P2002'))
      .mockResolvedValueOnce(undefined);
    const repository = new PrismaAttendanceRepository({ $transaction: transaction } as never);

    await expect(repository.applyRoster({} as never)).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-Prisma roster failure', async () => {
    const transaction = vi.fn().mockRejectedValueOnce(new Error('database unavailable'));
    const repository = new PrismaAttendanceRepository({ $transaction: transaction } as never);

    await expect(repository.applyRoster({} as never)).rejects.toThrow('database unavailable');
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('creates and audits a binding only when the student belongs to the professor group', async () => {
    const binding = {
      id: 'binding-1', matricula: '2251330008', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
      deviceBindingId: null, platform: 'ios', deviceInfo: 'Beacon iOS', bindingVersion: 1, active: true,
      createdAt: new Date('2026-08-25T12:00:00.000Z'), updatedAt: new Date('2026-08-25T12:00:00.000Z'),
    };
    const transaction = {
      attendanceRosterGroup: { findUnique: vi.fn(async () => ({
        id: 'group-1', externalGroupId: '947699', professorExternalId: '308127', active: true,
      })) },
      attendanceRosterStudent: { findUnique: vi.fn(async () => ({ active: true })) },
      studentDeviceBinding: {
        findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null), create: vi.fn(async () => binding),
      },
      deviceBindingAuditEvent: { create: vi.fn(async () => undefined) },
      attendanceOutboxEvent: { create: vi.fn(async () => undefined) },
    };
    const prisma = { $transaction: vi.fn(async (operation: (client: unknown) => Promise<unknown>) => operation(transaction)) };
    const repository = new PrismaAttendanceRepository(prisma as never);

    await expect(repository.bindByProfessor({
      externalGroupId: '947699', professorExternalId: '308127', matricula: '2251330008',
      attendanceUuid: '12345678-1234-4234-9234-123456789abc', deviceBindingId: null,
      platform: 'ios', deviceInfo: 'Beacon iOS', actorIdentityId: 'identity-professor-1',
      actorRole: 'PROFESSOR', reason: 'Alta desde la lista del grupo.', correlationId: 'request-1',
    })).resolves.toMatchObject({ created: true, duplicate: false, binding: { matricula: '2251330008' } });
    expect(transaction.attendanceRosterStudent.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { groupId_matricula: { groupId: 'group-1', matricula: '2251330008' } },
    }));
    expect(transaction.deviceBindingAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'BOUND_BY_PROFESSOR', actorRole: 'PROFESSOR' }),
    }));
  });

  it('rejects a professor who does not own or share the requested group', async () => {
    const transaction = {
      attendanceRosterGroup: { findUnique: vi.fn(async () => ({
        id: 'group-1', externalGroupId: '947699', professorExternalId: 'another-professor', active: true,
      })) },
      academicGroupAccessGrant: { findFirst: vi.fn(async () => null) },
      attendanceRosterStudent: { findUnique: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (operation: (client: unknown) => Promise<unknown>) => operation(transaction)) };
    const repository = new PrismaAttendanceRepository(prisma as never);

    await expect(repository.bindByProfessor({
      externalGroupId: '947699', professorExternalId: '308127', matricula: '2251330008',
      attendanceUuid: '12345678-1234-4234-9234-123456789abc', deviceBindingId: null,
      platform: 'ios', actorIdentityId: 'identity-professor-1', actorRole: 'PROFESSOR',
      reason: 'Alta desde la lista del grupo.', correlationId: 'request-1',
    })).rejects.toMatchObject({ code: 'PROFESSOR_STUDENT_FORBIDDEN' });
    expect(transaction.attendanceRosterStudent.findUnique).not.toHaveBeenCalled();
  });

  it('does not let a professor replace an already active student UUID', async () => {
    const transaction = {
      attendanceRosterGroup: { findUnique: vi.fn(async () => ({
        id: 'group-1', externalGroupId: '947699', professorExternalId: '308127', active: true,
      })) },
      attendanceRosterStudent: { findUnique: vi.fn(async () => ({ active: true })) },
      studentDeviceBinding: { findUnique: vi.fn(async () => ({
        id: 'binding-1', matricula: '2251330008', attendanceUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        deviceBindingId: null, platform: 'ios', deviceInfo: null, bindingVersion: 1, active: true,
        createdAt: new Date('2026-08-24T12:00:00.000Z'), updatedAt: new Date('2026-08-24T12:00:00.000Z'),
      })) },
    };
    const prisma = { $transaction: vi.fn(async (operation: (client: unknown) => Promise<unknown>) => operation(transaction)) };
    const repository = new PrismaAttendanceRepository(prisma as never);

    await expect(repository.bindByProfessor({
      externalGroupId: '947699', professorExternalId: '308127', matricula: '2251330008',
      attendanceUuid: '12345678-1234-4234-9234-123456789abc', deviceBindingId: null,
      platform: 'ios', actorIdentityId: 'identity-professor-1', actorRole: 'PROFESSOR',
      reason: 'Alta desde la lista del grupo.', correlationId: 'request-1',
    })).rejects.toMatchObject({ code: 'STUDENT_DEVICE_ALREADY_BOUND' });
  });
});

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('Concurrent transaction conflict', {
    code,
    clientVersion: '6.19.3',
  });
}
