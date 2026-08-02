import { z } from 'zod';

const status = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
export const rosterSnapshotSchema = z.object({
  externalGroupId: z.string().trim().min(1).max(160), uatGroupId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(240), groupLetter: z.string().trim().max(40).default(''),
  professorExternalId: z.string().trim().min(1).max(160), schedule: z.record(z.string(), z.unknown()),
  rosterVersion: z.string().min(1).max(160), rosterObservedAt: z.iso.datetime(), rosterAuthoritative: z.boolean(),
  students: z.array(z.object({
    matricula: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(240),
    uatStudentId: z.number().int().positive().nullable().optional(), listNumber: z.number().int().nonnegative().nullable().optional(),
  })).max(1_000),
});
export const captureAttendanceSchema = z.object({
  externalGroupId: z.string().trim().min(1).max(160),
  professorExternalId: z.string().trim().min(1).max(160),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  professorEntryAt: z.iso.datetime().nullable().optional(), professorExitAt: z.iso.datetime().nullable().optional(),
  uatSessionId: z.uuid().nullable().optional(),
  entries: z.array(z.object({
    matricula: z.string().trim().min(1).max(40).optional(),
    uatStudentId: z.number().int().positive().optional(),
    status,
  }).refine((entry) => Number(Boolean(entry.matricula)) + Number(Boolean(entry.uatStudentId)) === 1, {
    message: 'exactly one of matricula or uatStudentId is required',
  })).min(1).max(1_000),
});
export const deviceBindingSchema = z.object({
  matricula: z.string().trim().min(1).max(40), attendanceUuid: z.uuid(), deviceBindingId: z.uuid().nullable().optional(),
  platform: z.string().trim().max(40).nullable().optional(), deviceInfo: z.string().trim().max(500).nullable().optional(),
});
export const coordinatorBindingSchema = deviceBindingSchema.extend({
  actorIdentityId: z.string().trim().min(1).max(160), actorRole: z.enum(['COORDINATOR', 'SUPER_USER']),
  reason: z.string().trim().min(8).max(500),
});
export const coordinatorUnbindSchema = z.object({
  actorIdentityId: z.string().trim().min(1).max(160), actorRole: z.enum(['COORDINATOR', 'SUPER_USER']),
  reason: z.string().trim().min(8).max(500),
});
