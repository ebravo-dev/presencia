import type { TeacherAuthenticatedEvent } from './teacher-authenticated.event.js';

export interface DomainEventMap {
  'teacher.authenticated': TeacherAuthenticatedEvent;
}

export interface IDomainEventBus {
  publish<TName extends keyof DomainEventMap>(event: DomainEventMap[TName]): void;
  subscribe<TName extends keyof DomainEventMap>(
    eventName: TName,
    listener: (event: DomainEventMap[TName]) => Promise<void>,
  ): () => void;
}
