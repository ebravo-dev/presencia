import { describe, expect, it, vi } from 'vitest';
import type {
  AcademicCycleChangeActor,
  AcademicCycleRepository,
  AcademicCycleValue,
  ActiveAcademicCycleRecord,
} from '../domain/academic-cycle.js';
import { AcademicCycleService } from './academic-cycle.service.js';

describe('AcademicCycleService', () => {
  it('starts production at cycle 152 and keeps next-year cycles locked during 2026', async () => {
    const repository = fakeRepository();
    const service = new AcademicCycleService(repository, () => new Date('2026-12-31T12:00:00.000Z'));

    const status = await service.status();

    expect(status.active).toMatchObject({ externalId: 152, year: 2026, term: 3, name: '2026 - 3 OTOÑO' });
    expect(status.availableCycles.map(({ externalId }) => externalId)).toEqual([150, 151, 152]);
    expect(status.lockedCycles.map(({ externalId }) => externalId)).toEqual([153, 154, 155]);
  });

  it('automatically unlocks cycles 153, 154 and 155 when 2027 starts', async () => {
    const beforeMidnight = new AcademicCycleService(fakeRepository(), () => new Date('2027-01-01T05:59:00.000Z'));
    const service = new AcademicCycleService(fakeRepository(), () => new Date('2027-01-01T06:01:00.000Z'));

    expect((await beforeMidnight.status()).availableCycles.map(({ externalId }) => externalId)).toEqual([150, 151, 152]);
    const status = await service.status();

    expect(status.availableCycles.map(({ externalId }) => externalId)).toEqual([150, 151, 152, 153, 154, 155]);
    expect(status.lockedCycles.map(({ externalId }) => externalId)).toEqual([156, 157, 158]);
  });

  it('requires the year unlock before a super user can activate a future cycle', async () => {
    const service = new AcademicCycleService(fakeRepository(), () => new Date('2026-08-05T12:00:00.000Z'));

    await expect(service.changeActiveCycle(153, actor())).rejects.toMatchObject({
      code: 'ACADEMIC_CYCLE_LOCKED',
    });
  });

  it('persists an unlocked selection with the super-user audit actor', async () => {
    const repository = fakeRepository();
    const service = new AcademicCycleService(repository, () => new Date('2027-02-01T12:00:00.000Z'));

    const status = await service.changeActiveCycle(155, actor());

    expect(repository.changeActiveCycle).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 155, year: 2027, term: 3, name: '2027 - 3 OTOÑO' }),
      actor(),
    );
    expect(status.active).toMatchObject({ externalId: 155, year: 2027, term: 3 });
  });
});

function actor(): AcademicCycleChangeActor {
  return {
    actorIdentityId: 'super-user-1', actorRole: 'SUPER_USER',
    reason: 'Cambio de ciclo escolar activo.', correlationId: 'request-1',
  };
}

function fakeRepository(): AcademicCycleRepository & { changeActiveCycle: ReturnType<typeof vi.fn> } {
  let active: ActiveAcademicCycleRecord | null = null;
  const currentOrInitialize = vi.fn(async (initial: AcademicCycleValue) => {
    active ??= { ...initial, revision: 1, updatedAt: new Date('2026-08-05T00:00:00.000Z'), updatedByIdentityId: null };
    return active;
  });
  const changeActiveCycle = vi.fn(async (cycle: AcademicCycleValue, changeActor: AcademicCycleChangeActor) => {
    active = {
      ...cycle,
      revision: (active?.revision ?? 1) + 1,
      updatedAt: new Date('2027-02-01T00:00:00.000Z'),
      updatedByIdentityId: changeActor.actorIdentityId,
    };
    return active;
  });
  return { currentOrInitialize, changeActiveCycle };
}
