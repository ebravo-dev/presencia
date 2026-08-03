import { z } from 'zod';

const nullableText = z.string().nullable();

export const academicProjectionSnapshotSchema = z.object({
  externalGroupId: z.string().min(1),
  active: z.boolean(),
  observedAt: z.iso.datetime({ offset: true }),
  rosterVersion: z.string().min(1),
  teacher: z.object({
    externalId: z.string().min(1), institutionalCode: nullableText, name: z.string().min(1),
    email: nullableText, lastAuthenticatedAt: z.iso.datetime({ offset: true }),
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

export const attendanceProjectionSnapshotSchema = z.object({
  attendanceSessionId: z.string().min(1), externalGroupId: z.string().min(1),
  professorExternalId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  professorEntryAt: z.iso.datetime({ offset: true }).nullable(),
  professorExitAt: z.iso.datetime({ offset: true }).nullable(),
  entriesCount: z.number().int().nonnegative(),
  uploadStatus: z.enum(['DRAFT', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED']),
  uploadError: nullableText, version: z.number().int().positive(),
  observedAt: z.iso.datetime({ offset: true }),
});

export const academicProjectionResponseSchema = z.object({ data: z.array(academicProjectionSnapshotSchema) });
export const attendanceProjectionResponseSchema = z.object({ data: z.array(attendanceProjectionSnapshotSchema) });

export type AcademicProjectionSnapshot = z.infer<typeof academicProjectionSnapshotSchema>;
export type AttendanceProjectionSnapshot = z.infer<typeof attendanceProjectionSnapshotSchema>;
