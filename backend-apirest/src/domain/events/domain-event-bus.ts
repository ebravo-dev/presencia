import type { TeacherAuthenticatedEvent } from './teacher-authenticated.event.js';

export interface DomainEventMap {
  'uat.teacher_authenticated.v1': TeacherAuthenticatedEvent;
}

export interface IDomainEventBus {
  publish<TName extends keyof DomainEventMap>(event: DomainEventMap[TName]): Promise<void>;
  subscribe<TName extends keyof DomainEventMap>(
    eventName: TName,
    listener: (event: DomainEventMap[TName]) => Promise<void>,
  ): () => void;
}
