import { z } from 'zod';

export const changeActiveAcademicCycleSchema = z.object({
  cycleExternalId: z.number().int().positive(),
  actorIdentityId: z.string().trim().min(1).max(160),
  actorRole: z.literal('SUPER_USER'),
  reason: z.string().trim().min(8).max(500),
});

const studentSchema = z.object({
  matricula: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(240),
  uatStudentId: z.number().int().positive().nullable().optional(),
  listNumber: z.number().int().nonnegative().nullable().optional(),
});
const groupSchema = z.object({
  externalGroupId: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(80),
  groupLetter: z.string().trim().max(40).default(''),
  name: z.string().trim().min(1).max(240),
  level: z.string().trim().max(160).nullable().optional(),
  classroom: z.string().trim().max(160).nullable().optional(),
  period: z.string().trim().max(80).nullable().optional(),
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

const sharedClassActorSchema = z.object({
  actorIdentityId: z.string().trim().min(1).max(160),
  actorRole: z.enum(['COORDINATOR', 'SYSTEM']),
  reason: z.string().trim().min(8).max(500),
});
const sharedClassValueSchema = z.object({
  sourceAssignmentId: z.string().trim().min(1).max(160),
  assignedTeacherId: z.string().trim().min(1).max(160),
  schoolCycleYear: z.number().int().min(2000).max(2100),
  schoolCycleTerm: z.number().int().min(1).max(3),
  active: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export const createSharedClassSchema = sharedClassValueSchema.extend(sharedClassActorSchema.shape);
export const updateSharedClassSchema = sharedClassValueSchema.partial().extend(sharedClassActorSchema.shape).refine(
  ({ sourceAssignmentId, assignedTeacherId, schoolCycleYear, schoolCycleTerm, active, notes }) =>
    [sourceAssignmentId, assignedTeacherId, schoolCycleYear, schoolCycleTerm, active, notes].some((value) => value !== undefined),
  { message: 'Al menos un campo de la asignación es requerido.' },
);
export const deleteSharedClassSchema = sharedClassActorSchema;
export const sharedClassesForTeacherSchema = z.object({
  identity: z.string().trim().min(1).max(320),
  year: z.number().int().min(2000).max(2100).optional(),
  term: z.number().int().min(1).max(3).optional(),
}).refine(({ year, term }) => (year === undefined) === (term === undefined), {
  message: 'year y term deben enviarse juntos.',
});

const legacyTeacherSchema = z.object({
  externalId: z.string().trim().min(1).max(160),
  institutionalCode: z.string().trim().max(160).nullable(),
  name: z.string().trim().min(1).max(240),
  email: z.email().nullable(),
  lastAuthenticatedAt: z.iso.datetime(),
});
export const legacySharedClassImportSchema = z.object({
  records: z.array(z.object({
    legacySourceId: z.string().trim().min(1).max(160),
    schoolCycleYear: z.number().int().min(2000).max(2100),
    schoolCycleTerm: z.number().int().min(1).max(3),
    active: z.boolean(),
    notes: z.string().trim().max(500).nullable(),
    createdAt: z.iso.datetime(),
    observedAt: z.iso.datetime(),
    sourceAssignment: z.object({
      externalGroupId: z.string().trim().min(1).max(160),
      groupCode: z.string().trim().max(40).nullable(),
      schoolCycleExternalId: z.string().trim().min(1).max(160),
      schoolCycleName: z.string().trim().max(240).nullable(),
      classroom: z.string().trim().max(160).nullable(),
      educationLevel: z.string().trim().max(160).nullable(),
      period: z.string().trim().max(80).nullable(),
      schedule: z.record(z.string(), z.unknown()),
      teacher: legacyTeacherSchema,
      subject: z.object({
        externalId: z.string().trim().min(1).max(160),
        code: z.string().trim().max(80).nullable(),
        name: z.string().trim().min(1).max(240),
      }),
      coordination: z.object({
        externalId: z.string().trim().min(1).max(160),
        name: z.string().trim().min(1).max(240),
        shortName: z.string().trim().max(120).nullable(),
      }),
    }),
    assignedTeacher: legacyTeacherSchema,
  })).max(5_000),
});
