import { z } from 'zod';

export const eventNames = [
  'attendance.upload_requested.v1',
  'attendance.upload_succeeded.v1',
  'attendance.upload_failed.v1',
  'academic.snapshot_updated.v1',
  'identity.device_binding_changed.v1',
  'teacher.authenticated.v1',
] as const;

export const eventNameSchema = z.enum(eventNames);

export const domainEventEnvelopeSchema = z.object({
  id: z.uuid(),
  name: eventNameSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  correlationId: z.string().min(1).max(128),
  producer: z.string().min(1).max(80),
  aggregateId: z.string().min(1).max(160),
  payload: z.record(z.string(), z.unknown()),
});

export type EventName = z.infer<typeof eventNameSchema>;
export type DomainEventEnvelope = z.infer<typeof domainEventEnvelopeSchema>;

export function parseDomainEvent(value: unknown): DomainEventEnvelope {
  return domainEventEnvelopeSchema.parse(value);
}
