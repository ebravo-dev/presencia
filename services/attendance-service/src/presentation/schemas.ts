import { z } from 'zod';

const status = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
export const rosterSnapshotSchema = z.object({
  externalGroupId: z.string().trim().min(1).max(160), uatGroupId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(240), groupLetter: z.string().trim().max(40).default(''),
  professorExternalId: z.string().trim().min(1).max(160),
  professorName: z.string().trim().max(240).optional(), professorEmail: z.email().nullable().optional(),
  classroom: z.string().trim().max(160).nullable().optional(),
  period: z.string().trim().max(80).nullable().optional(), schedule: z.record(z.string(), z.unknown()),
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
  entries: z.array(z.object({
    matricula: z.string().trim().min(1).max(40).optional(),
    uatStudentId: z.number().int().positive().optional(),
    status,
  }).refine((entry) => Number(Boolean(entry.matricula)) + Number(Boolean(entry.uatStudentId)) === 1, {
    message: 'exactly one of matricula or uatStudentId is required',
  })).min(1).max(1_000),
}).strict();
export const deviceBindingSchema = z.object({
  matricula: z.string().trim().min(1).max(40), attendanceUuid: z.uuid(), deviceBindingId: z.uuid(),
  platform: z.enum(['android', 'ios']), deviceInfo: z.string().trim().max(500).nullable().optional(),
}).strict();
export const resolveDeviceBindingsSchema = z.object({
  professorExternalId: z.string().trim().min(1).max(160),
  matriculas: z.array(z.string().trim().min(1).max(40)).min(1).max(1_000),
});
export const coordinatorBindingSchema = deviceBindingSchema.extend({
  actorIdentityId: z.string().trim().min(1).max(160), actorRole: z.enum(['COORDINATOR', 'SUPER_USER']),
  reason: z.string().trim().min(8).max(500),
});
export const coordinatorUnbindSchema = z.object({
  actorIdentityId: z.string().trim().min(1).max(160), actorRole: z.enum(['COORDINATOR', 'SUPER_USER']),
  reason: z.string().trim().min(8).max(500),
});
export const attendanceSettingsUpdateSchema = z.object({
  teacherAttendanceToleranceMinutes: z.number().int().min(0).max(120),
  actorIdentityId: z.string().trim().min(1).max(160),
  actorRole: z.enum(['COORDINATOR', 'SUPER_USER']),
}).strict();

const beaconValueSchema = z.object({
  uuid: z.uuid(),
  classroom: z.string().trim().min(1).max(160),
});
const beaconActorSchema = z.object({
  actorIdentityId: z.string().trim().min(1).max(160),
  actorRole: z.enum(['COORDINATOR', 'SUPER_USER']),
  reason: z.string().trim().min(8).max(500),
});
export const createClassroomBeaconSchema = beaconValueSchema.extend(beaconActorSchema.shape);
export const updateClassroomBeaconSchema = beaconValueSchema.partial().extend(beaconActorSchema.shape).refine(
  ({ uuid, classroom }) => uuid !== undefined || classroom !== undefined,
  { message: 'uuid o classroom es requerido' },
);
export const deleteClassroomBeaconSchema = beaconActorSchema;
export const importClassroomBeaconsSchema = z.object({
  beacons: z.array(beaconValueSchema).max(10_000),
  actorIdentityId: z.string().trim().min(1).max(160),
  actorRole: z.literal('SYSTEM'),
  reason: z.string().trim().min(8).max(500),
});
export const resolveClassroomBeaconsSchema = z.object({
  professorExternalId: z.string().trim().min(1).max(160).optional(),
  professorEmail: z.email().optional(),
  classrooms: z.array(z.string().trim().min(1).max(160)).min(1).max(1_000),
}).refine(({ professorExternalId, professorEmail }) => Boolean(professorExternalId || professorEmail), {
  message: 'professorExternalId o professorEmail es requerido',
});
export const resolveAuthorizedClassroomBeaconsSchema = z.object({
  classrooms: z.array(z.string().trim().min(1).max(160)).min(1).max(1_000),
});

const presenceActorSchema = z.object({
  professorExternalId: z.string().trim().min(1).max(160),
  externalGroupId: z.string().trim().min(1).max(160),
  trustedGroupAuthorization: z.boolean().default(false),
});
const nullableClientDate = z.iso.datetime().nullable().optional();
export const professorEntryObservationSchema = presenceActorSchema.extend({
  beaconUuid: z.uuid(), clientDetectedAt: nullableClientDate,
  rssi: z.number().int().min(-160).max(20).nullable().optional(),
  distance: z.number().nonnegative().max(10_000).nullable().optional(),
  bluetoothAddress: z.string().trim().max(80).nullable().optional(),
});
export const professorExitObservationSchema = presenceActorSchema.extend({
  clientDetectedAt: nullableClientDate,
});
export const studentPresenceObservationSchema = presenceActorSchema.extend({
  detections: z.array(z.object({
    beaconUuid: z.uuid(), detectedAt: nullableClientDate,
    rssi: z.number().int().min(-160).max(20).nullable().optional(),
    distance: z.number().nonnegative().max(10_000).nullable().optional(),
    txPower: z.number().int().min(-160).max(20).nullable().optional(),
    bluetoothAddress: z.string().trim().max(80).nullable().optional(),
    major: z.number().int().min(0).max(65_535).nullable().optional(),
    minor: z.number().int().min(0).max(65_535).nullable().optional(),
  })).min(1).max(1_000),
});
