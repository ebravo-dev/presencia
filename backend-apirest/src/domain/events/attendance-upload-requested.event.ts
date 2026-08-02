import { z } from 'zod';

export const ATTENDANCE_UPLOAD_REQUESTED_EVENT = 'attendance.upload_requested.v1' as const;

const entrySchema = z.object({
  matricula: z.string().min(1), status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  uatStudentId: z.number().int().positive().nullable(), listNumber: z.number().int().nonnegative().nullable(),
});

export const attendanceUploadRequestedEventSchema = z.object({
  eventId: z.string().uuid(), eventType: z.literal(ATTENDANCE_UPLOAD_REQUESTED_EVENT),
  occurredAt: z.string().datetime(), correlationId: z.string().min(1).max(128), causationId: z.string().min(1).max(128),
  producer: z.literal('attendance-service'), aggregateId: z.string().min(1), schemaVersion: z.literal(1),
  payload: z.object({
    attendanceSessionId: z.string().min(1), externalGroupId: z.string().min(1), uatGroupId: z.number().int().positive().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), professorExternalId: z.string().min(1),
    uatSessionId: z.string().uuid().nullable(), entries: z.array(entrySchema).min(1).max(1_000),
    version: z.number().int().positive(),
  }),
});

export type AttendanceUploadRequestedEvent = z.infer<typeof attendanceUploadRequestedEventSchema>;
