import {
  INITIAL_ACTIVE_CYCLE,
  cycleFor,
  cyclesAvailableThrough,
  type AcademicCycleChangeActor,
  type AcademicCycleRepository,
  type AcademicCycleValue,
} from '../domain/academic-cycle.js';

export class AcademicCycleError extends Error {
  constructor(readonly code: 'ACADEMIC_CYCLE_LOCKED' | 'ACADEMIC_CYCLE_UNKNOWN', message: string) {
    super(message);
    this.name = 'AcademicCycleError';
  }
}

export class AcademicCycleService {
  constructor(
    private readonly repository: AcademicCycleRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly timeZone = 'America/Monterrey',
  ) {}

  async status() {
    const currentYear = this.currentYear();
    const active = await this.repository.currentOrInitialize(INITIAL_ACTIVE_CYCLE);
    return {
      active,
      availableCycles: cyclesAvailableThrough(currentYear),
      lockedCycles: [1, 2, 3].map((term) => cycleFor(currentYear + 1, term as 1 | 2 | 3)),
      nextUnlockAt: `${currentYear + 1}-01-01T00:00:00`,
      timeZone: this.timeZone,
    };
  }

  async changeActiveCycle(cycleExternalId: number, actor: AcademicCycleChangeActor) {
    const availableCycles = cyclesAvailableThrough(this.currentYear());
    const selected = availableCycles.find(({ externalId }) => externalId === cycleExternalId);
    if (!selected) {
      const knownFuture = [1, 2, 3]
        .map((term) => cycleFor(this.currentYear() + 1, term as 1 | 2 | 3))
        .some(({ externalId }) => externalId === cycleExternalId);
      throw new AcademicCycleError(
        knownFuture ? 'ACADEMIC_CYCLE_LOCKED' : 'ACADEMIC_CYCLE_UNKNOWN',
        knownFuture
          ? 'Ese ciclo se habilitará automáticamente al comenzar su año escolar.'
          : 'El ciclo solicitado no pertenece al catálogo administrado.',
      );
    }
    await this.repository.changeActiveCycle(selected, actor);
    return this.status();
  }

  async activeCycle(): Promise<AcademicCycleValue> {
    const { active } = await this.status();
    return {
      externalId: active.externalId,
      year: active.year,
      term: active.term,
      name: active.name,
    };
  }

  private currentYear(): number {
    const value = new Intl.DateTimeFormat('en-US', { timeZone: this.timeZone, year: 'numeric' }).format(this.now());
    return Number(value);
  }
}
