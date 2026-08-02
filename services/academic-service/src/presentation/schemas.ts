import { z } from 'zod';

const studentSchema = z.object({ matricula: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(240) });
const groupSchema = z.object({
  externalGroupId: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(80),
  groupLetter: z.string().trim().max(40).default(''),
  name: z.string().trim().min(1).max(240),
  level: z.string().trim().max(160).nullable().optional(),
  classroom: z.string().trim().max(160).nullable().optional(),
  schedule: z.record(z.string(), z.unknown()),
  subject: z.object({
    externalId: z.string().trim().min(1).max(160), code: z.string().trim().max(80).nullable().optional(),
    name: z.string().trim().min(1).max(240),
  }),
  coordination: z.object({
    externalId: z.string().trim().min(1).max(160), name: z.string().trim().min(1).max(240),
    shortName: z.string().trim().max(120).nullable().optional(),
  }),
  rosterAuthoritative: z.boolean(),
  students: z.array(studentSchema).max(1_000),
});

export const academicSnapshotSchema = z.object({
  snapshotId: z.uuid(),
  correlationId: z.string().min(1).max(128),
  causationId: z.string().min(1).max(128),
  teacher: z.object({
    externalId: z.string().trim().min(1).max(160), institutionalCode: z.string().trim().max(160).nullable().optional(),
    name: z.string().trim().min(1).max(240), email: z.email().nullable().optional(), authenticatedAt: z.iso.datetime(),
  }),
  cycle: z.object({ externalId: z.string().trim().min(1).max(160), name: z.string().trim().min(1).max(240) }),
  groups: z.array(groupSchema).max(500),
});

export const studentAcademicSnapshotSchema = z.object({
  snapshotId: z.uuid(), correlationId: z.string().min(1).max(128), causationId: z.string().min(1).max(128),
  synchronizedAt: z.iso.datetime(),
  student: z.object({
    matricula: z.string().trim().min(1).max(40), displayName: z.string().trim().min(1).max(240),
    email: z.email().nullable().optional(),
  }),
  career: z.object({
    planExternalId: z.string().trim().min(1).max(160), name: z.string().trim().min(1).max(240),
    coordinationExternalId: z.string().trim().max(160).nullable().optional(),
  }),
  cycle: z.object({ externalId: z.string().trim().min(1).max(160), name: z.string().trim().min(1).max(240) }),
  schedule: z.array(z.object({
    externalGroupId: z.string().trim().min(1).max(160), groupLetter: z.string().trim().max(40).default(''),
    subjectName: z.string().trim().min(1).max(240), professorName: z.string().trim().max(240).nullable().optional(),
    classroom: z.string().trim().max(160).nullable().optional(), period: z.string().trim().max(80).nullable().optional(),
    credits: z.number().int().nonnegative().max(100).nullable().optional(), schedule: z.record(z.string(), z.unknown()),
  })).max(100),
});
