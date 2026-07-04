import type { IDomainEventBus } from '../../domain/events/domain-event-bus.js';
import { TEACHER_AUTHENTICATED_EVENT } from '../../domain/events/teacher-authenticated.event.js';
import type { HarvestTeacherDataUseCase } from '../use-cases/harvest-teacher-data.use-case.js';

export interface SyncLogger {
  info(bindings: object, message: string): void;
  warn(bindings: object, message: string): void;
  error(bindings: object, message: string): void;
}

export class SyncTeacherDataListener {
  constructor(
    private readonly eventBus: IDomainEventBus,
    private readonly harvestTeacherData: HarvestTeacherDataUseCase,
    private readonly logger: SyncLogger,
  ) {}

  register(): () => void {
    return this.eventBus.subscribe(TEACHER_AUTHENTICATED_EVENT, async (event) => {
      const startedAt = Date.now();

      try {
        const result = await this.harvestTeacherData.execute(event);
        const bindings = { eventId: event.eventId, sessionId: event.sessionId, durationMs: Date.now() - startedAt, ...result };

        if (result.skipped) {
          this.logger.warn(bindings, 'Cosecha de datos del profesor omitida.');
        } else {
          this.logger.info(bindings, 'Cosecha de datos del profesor completada.');
        }
      } catch (error) {
        this.logger.error(
          { err: error, eventId: event.eventId, sessionId: event.sessionId, durationMs: Date.now() - startedAt },
          'Fallo la cosecha local; la sesion UAT permanece activa.',
        );
      }
    });
  }
}
