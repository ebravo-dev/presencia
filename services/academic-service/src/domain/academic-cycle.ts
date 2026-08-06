export type AcademicCycleTerm = 1 | 2 | 3;

export interface AcademicCycleValue {
  externalId: number;
  year: number;
  term: AcademicCycleTerm;
  name: string;
}

export interface ActiveAcademicCycleRecord extends AcademicCycleValue {
  revision: number;
  updatedAt: Date;
  updatedByIdentityId: string | null;
}

export interface AcademicCycleChangeActor {
  actorIdentityId: string;
  actorRole: 'SUPER_USER';
  reason: string;
  correlationId: string;
}

export interface AcademicCycleRepository {
  currentOrInitialize(initial: AcademicCycleValue): Promise<ActiveAcademicCycleRecord>;
  changeActiveCycle(cycle: AcademicCycleValue, actor: AcademicCycleChangeActor): Promise<ActiveAcademicCycleRecord>;
}

export const FIRST_MANAGED_CYCLE = Object.freeze({
  externalId: 150,
  year: 2026,
  term: 1 as const,
  name: '2026 - 1 PRIMAVERA',
});

export const INITIAL_ACTIVE_CYCLE = cycleFor(2026, 3);

export function cycleFor(year: number, term: AcademicCycleTerm): AcademicCycleValue {
  if (!Number.isInteger(year) || year < FIRST_MANAGED_CYCLE.year) throw new Error('ACADEMIC_CYCLE_YEAR_OUT_OF_RANGE');
  const externalId = FIRST_MANAGED_CYCLE.externalId
    + ((year - FIRST_MANAGED_CYCLE.year) * 3)
    + (term - FIRST_MANAGED_CYCLE.term);
  return { externalId, year, term, name: `${year} - ${term} ${termName(term)}` };
}

export function cyclesAvailableThrough(year: number): AcademicCycleValue[] {
  const lastYear = Math.max(FIRST_MANAGED_CYCLE.year, year);
  const result: AcademicCycleValue[] = [];
  for (let cycleYear = FIRST_MANAGED_CYCLE.year; cycleYear <= lastYear; cycleYear += 1) {
    for (const term of [1, 2, 3] as const) result.push(cycleFor(cycleYear, term));
  }
  return result;
}

function termName(term: AcademicCycleTerm): string {
  if (term === 1) return 'PRIMAVERA';
  if (term === 2) return 'VERANO';
  return 'OTOÑO';
}
