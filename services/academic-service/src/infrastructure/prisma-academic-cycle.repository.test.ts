import { describe, expect, it, vi } from 'vitest';
import { cycleFor } from '../domain/academic-cycle.js';
import { PrismaAcademicCycleRepository } from './prisma-academic-cycle.repository.js';

describe('PrismaAcademicCycleRepository', () => {
  it('audits the change and deactivates groups from the previous cycle', async () => {
    const current = configuration(152, 2026, 3, '2026 - 3 OTOÑO', 1);
    const updated = configuration(153, 2027, 1, '2027 - 1 PRIMAVERA', 2);
    const transaction = {
      academicCycleConfiguration: {
        upsert: vi.fn(async () => current),
        update: vi.fn(async () => updated),
      },
      academicCycleConfigurationAudit: { create: vi.fn(async () => undefined) },
      academicCycle: {
        upsert: vi.fn(async () => ({ id: 'cycle-153' })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      academicGroup: {
        findMany: vi.fn(async () => [{ id: 'group-db-1', externalGroupId: 'uat-group-1' }]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      academicEnrollment: { updateMany: vi.fn(async () => ({ count: 20 })) },
      academicOutboxEvent: { create: vi.fn(async () => undefined) },
    };
    const prisma = { $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)) };
    const repository = new PrismaAcademicCycleRepository(prisma as never);

    const result = await repository.changeActiveCycle(cycleFor(2027, 1), {
      actorIdentityId: 'super-user-1', actorRole: 'SUPER_USER',
      reason: 'Cambio del ciclo escolar activo.', correlationId: 'request-cycle-1',
    });

    expect(result).toMatchObject({ externalId: 153, year: 2027, term: 1, revision: 2 });
    expect(transaction.academicCycleConfigurationAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousCycleExternalId: 152, nextCycleExternalId: 153,
        actorIdentityId: 'super-user-1', correlationId: 'request-cycle-1',
      }),
    });
    expect(transaction.academicGroup.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['group-db-1'] } }, data: { active: false },
    });
    expect(transaction.academicOutboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'academic.group_deactivated.v1', aggregateId: 'uat-group-1',
        correlationId: 'request-cycle-1',
      }),
    });
  });
});

function configuration(
  cycleExternalId: number,
  cycleYear: number,
  cycleTerm: number,
  cycleName: string,
  revision: number,
) {
  return {
    key: 'active', cycleExternalId, cycleYear, cycleTerm, cycleName, revision,
    updatedByIdentityId: null, correlationId: null,
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
  };
}
