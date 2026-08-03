import { z } from 'zod';
import { ApiError } from '../../../errors/api-error.js';

export const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const studentCredentialsSchema = credentialsSchema.extend({
  idPlanEstudio: z.coerce.number().int().positive().optional(),
  attendanceUuid: z.string().uuid(),
  deviceBindingId: z.string().uuid(),
  platform: z.enum(['android', 'ios']),
  deviceInfo: z.string().max(500).optional(),
}).strict();

export const professorDeviceBindingResolveSchema = z.object({
  matriculas: z.array(z.string().trim().min(1).max(40)).min(1).max(1_000),
});

export const professorBeaconResolveSchema = z.object({
  classrooms: z.array(z.string().trim().min(1).max(160)).min(1).max(1_000),
});

const professorPresenceBaseSchema = z.object({
  externalGroupId: z.string().trim().min(1).max(160),
});
const optionalObservationDate = z.string().datetime({ offset: true }).nullable().optional();
export const professorPresenceEntrySchema = professorPresenceBaseSchema.extend({
  beaconUuid: z.string().uuid(), clientDetectedAt: optionalObservationDate,
  rssi: z.number().int().min(-160).max(20).nullable().optional(),
  distance: z.number().nonnegative().max(10_000).nullable().optional(),
  bluetoothAddress: z.string().trim().max(80).nullable().optional(),
});
export const professorPresenceExitSchema = professorPresenceBaseSchema.extend({
  clientDetectedAt: optionalObservationDate,
});
export const studentPresenceDetectionsSchema = professorPresenceBaseSchema.extend({
  detections: z.array(z.object({
    beaconUuid: z.string().uuid(), detectedAt: optionalObservationDate,
    rssi: z.number().int().min(-160).max(20).nullable().optional(),
    distance: z.number().nonnegative().max(10_000).nullable().optional(),
    txPower: z.number().int().min(-160).max(20).nullable().optional(),
    bluetoothAddress: z.string().trim().max(80).nullable().optional(),
    major: z.number().int().min(0).max(65_535).nullable().optional(),
    minor: z.number().int().min(0).max(65_535).nullable().optional(),
  })).min(1).max(1_000),
});

export const consultaQuerySchema = z.object({
  Id_Ciclo_Escolar: z.coerce.number().int().positive(),
  Id_DES: z.coerce.number().int().positive(),
});

export const snapshotSchema = credentialsSchema.extend({
  Id_Ciclo_Escolar: z.coerce.number().int().positive(),
  Id_DES: z.coerce.number().int().positive(),
  includeExamenes: z.boolean().optional().default(true),
});

export const campusQuerySchema = z.object({
  id_nivel_educativo: z.coerce.number().int().positive(),
});

export const desQuerySchema = campusQuerySchema.extend({
  id_cu: z.coerce.number().int().positive(),
});

const fechaUatSchema = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, {
  message: 'El formato de fecha debe ser estrictamente DD/MM/YYYY',
});

const isoLikeDateTimeSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || null)
  .refine((value) => value == null || !Number.isNaN(Date.parse(value)), {
    message: 'Debe ser un datetime ISO valido.',
  });

export const gruposProfesorQuerySchema = z.object({
  Id_Des: z.coerce.number().int().positive(),
  Id_Ciclo: z.coerce.number().int().positive(),
  Id_Plantilla: z.coerce.number().int().positive(),
});

export const sharedClassesQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  term: z.coerce.number().int().min(1).max(3).optional(),
}).refine((value) => (value.year === undefined) === (value.term === undefined), {
  message: 'year y term deben enviarse juntos.',
});

export const semanasGrupoQuerySchema = z.object({
  Id_Grupo: z.coerce.number().int().positive(),
});

export const asistenciaGrupoQuerySchema = semanasGrupoQuerySchema.extend({
  fec_ini: fechaUatSchema,
  fec_fin: fechaUatSchema,
});

export const asistenciaAlumnoInputSchema = z.object({
  id_alumno: z.number().int().positive(),
  num_pase_lista: z.number().int().nonnegative(),
  num_dia: z.number().int().min(1).max(7),
  sn_asistencia: z.boolean(),
});

export const registrarAsistenciasBodySchema = z.object({
  Id_Grupo: z.number().int().positive(),
  Fec_Ini: fechaUatSchema,
  Asistencia: z.array(asistenciaAlumnoInputSchema).min(1),
  ProfessorEntryAt: isoLikeDateTimeSchema,
  ProfessorExitAt: isoLikeDateTimeSchema,
}).strict();

export const sessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export const selectStudentCareerSchema = z.object({
  idPlanEstudio: z.coerce.number().int().positive(),
});

export function parsePayload<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Solicitud invalida.', result.error.flatten());
  }

  return result.data;
}
