import { z } from 'zod';

export const eventNames = [
  'identity.professor_authenticated.v1',
  'identity.student_authenticated.v1',
  'academic.roster_updated.v1',
  'academic.group_deactivated.v1',
  'academic.substitution_changed.v1',
  'academic.student_schedule_updated.v1',
  'attendance.recorded.v1',
  'attendance.corrected.v1',
  'attendance.upload_requested.v1',
  'attendance.device_bound.v1',
  'attendance.device_unbound.v1',
  'uat.attendance_uploaded.v1',
  'uat.attendance_upload_failed.v1',
  'uat.academic_snapshot_fetched.v1',
  'uat.teacher_authenticated.v1',
] as const;

export const eventNameSchema = z.enum(eventNames);

export const domainEventEnvelopeSchema = z.object({
  eventId: z.uuid(),
  eventType: eventNameSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  correlationId: z.string().min(1).max(128),
  causationId: z.string().min(1).max(128),
  producer: z.string().min(1).max(80),
  aggregateId: z.string().min(1).max(160),
  schemaVersion: z.literal(1),
  payload: z.record(z.string(), z.unknown()),
});

export type EventName = z.infer<typeof eventNameSchema>;
export type DomainEventEnvelope = z.infer<typeof domainEventEnvelopeSchema>;

export function parseDomainEvent(value: unknown): DomainEventEnvelope {
  return domainEventEnvelopeSchema.parse(value);
}
