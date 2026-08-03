import { parseDomainEvent, type DomainEventEnvelope } from '@presencia/contracts-events';
import { z } from 'zod';

const nullableText = z.string().nullable().optional();
const academicRosterPayloadSchema = z.object({
  externalGroupId: z.string().min(1),
  rosterVersion: z.string().min(1),
  teacher: z.object({
    externalId: z.string().min(1), institutionalCode: nullableText, name: z.string().min(1),
    email: nullableText, lastAuthenticatedAt: z.iso.datetime(),
  }),
  cycle: z.object({ externalId: z.string().min(1), name: z.string().min(1) }),
  group: z.object({
    externalGroupId: z.string().min(1), code: z.string(), groupLetter: z.string(), name: z.string().min(1),
    level: nullableText, classroom: nullableText, period: nullableText,
    schedule: z.record(z.string(), z.unknown()),
  }),
  subject: z.object({ externalId: z.string().min(1), code: nullableText, name: z.string().min(1) }),
  coordination: z.object({ externalId: z.string().min(1), name: z.string().min(1), shortName: nullableText }),
});
const groupDeactivatedPayloadSchema = z.object({ externalGroupId: z.string().min(1) });
const attendancePayloadSchema = z.object({
  attendanceSessionId: z.string().min(1), externalGroupId: z.string().min(1),
  professorExternalId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  professorEntryAt: z.iso.datetime().nullable(), professorExitAt: z.iso.datetime().nullable(),
  entries: z.array(z.unknown()).optional(), entriesCount: z.number().int().nonnegative().optional(),
  version: z.number().int().positive(),
  uploadStatus: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  uploadError: z.string().nullable().optional(),
}).refine((payload) => payload.entries !== undefined || payload.entriesCount !== undefined, {
  message: 'Attendance entries or entriesCount is required',
});
const uploadResultPayloadSchema = z.object({
  attendanceSessionId: z.string().min(1), version: z.number().int().positive(), error: z.string().nullable(),
});

export type ProjectionEvent =
  | (DomainEventEnvelope & { eventType: 'academic.roster_updated.v1'; payload: z.infer<typeof academicRosterPayloadSchema> })
  | (DomainEventEnvelope & { eventType: 'academic.group_deactivated.v1'; payload: z.infer<typeof groupDeactivatedPayloadSchema> })
  | (DomainEventEnvelope & { eventType: 'attendance.recorded.v1'; payload: z.infer<typeof attendancePayloadSchema> })
  | (DomainEventEnvelope & { eventType: 'attendance.corrected.v1'; payload: z.infer<typeof attendancePayloadSchema> })
  | (DomainEventEnvelope & { eventType: 'uat.attendance_uploaded.v1'; payload: z.infer<typeof uploadResultPayloadSchema> })
  | (DomainEventEnvelope & { eventType: 'uat.attendance_upload_failed.v1'; payload: z.infer<typeof uploadResultPayloadSchema> });

export function parseProjectionEvent(value: unknown): ProjectionEvent {
  const envelope = parseDomainEvent(value);
  switch (envelope.eventType) {
    case 'academic.roster_updated.v1':
      return { ...envelope, payload: academicRosterPayloadSchema.parse(envelope.payload) } as ProjectionEvent;
    case 'academic.group_deactivated.v1':
      return { ...envelope, payload: groupDeactivatedPayloadSchema.parse(envelope.payload) } as ProjectionEvent;
    case 'attendance.recorded.v1':
    case 'attendance.corrected.v1':
      return { ...envelope, payload: attendancePayloadSchema.parse(envelope.payload) } as ProjectionEvent;
    case 'uat.attendance_uploaded.v1':
    case 'uat.attendance_upload_failed.v1':
      return { ...envelope, payload: uploadResultPayloadSchema.parse(envelope.payload) } as ProjectionEvent;
    default:
      throw new Error(`Unsupported coordination projection event: ${envelope.eventType}`);
  }
}
