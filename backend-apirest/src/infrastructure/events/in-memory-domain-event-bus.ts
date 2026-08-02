import { EventEmitter } from 'node:events';
import type { DomainEventMap, IDomainEventBus } from '../../domain/events/domain-event-bus.js';

export interface EventBusLogger {
  error(bindings: object, message: string): void;
}

export class InMemoryDomainEventBus implements IDomainEventBus {
  private readonly emitter = new EventEmitter();
  private readonly publishedSessionIds = new Map<string, number>();
  private readonly deduplicationWindowMs = 24 * 60 * 60 * 1000;

  constructor(private readonly logger: EventBusLogger) {}

  async publish<TName extends keyof DomainEventMap>(event: DomainEventMap[TName]): Promise<void> {
    if (event.eventType === 'uat.teacher_authenticated.v1') {
      this.prunePublishedSessions();
      if (this.publishedSessionIds.has(event.sessionId)) return;
      this.publishedSessionIds.set(event.sessionId, Date.now());
    }

    setImmediate(() => this.emitter.emit(event.eventType, event));
  }

  subscribe<TName extends keyof DomainEventMap>(
    eventName: TName,
    listener: (event: DomainEventMap[TName]) => Promise<void>,
  ): () => void {
    const wrapped = (event: DomainEventMap[TName]) => {
      void listener(event).catch((error: unknown) => {
        this.logger.error({ err: error, eventName, eventId: event.eventId }, 'Fallo un suscriptor de evento de dominio.');
      });
    };

    this.emitter.on(eventName, wrapped);
    return () => this.emitter.off(eventName, wrapped);
  }

  private prunePublishedSessions(): void {
    const cutoff = Date.now() - this.deduplicationWindowMs;
    for (const [sessionId, publishedAt] of this.publishedSessionIds) {
      if (publishedAt < cutoff) this.publishedSessionIds.delete(sessionId);
    }
  }
}
