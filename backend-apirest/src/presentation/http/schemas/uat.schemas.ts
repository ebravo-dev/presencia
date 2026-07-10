import { z } from 'zod';
import { ApiError } from '../../../errors/api-error.js';

export const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const studentCredentialsSchema = credentialsSchema.extend({
  idPlanEstudio: z.coerce.number().int().positive().optional(),
  attendanceUuid: z.string().uuid().optional(),
  deviceBindingId: z.string().uuid().optional(),
  platform: z.string().max(40).optional(),
  deviceInfo: z.string().max(500).optional(),
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
  Asistencia: z.array(asistenciaAlumnoInputSchema),
  DebugReportOnly: z.boolean().optional().default(false),
  Code: z.string().trim().optional(),
  GroupLetter: z.string().trim().optional().default(''),
  Period: z.string().trim().optional(),
  GroupName: z.string().trim().optional(),
  Classroom: z.string().trim().optional(),
  Level: z.string().trim().optional(),
  Schedule: z.record(z.unknown()).optional(),
  CreateMissingGroup: z.boolean().optional().default(false),
  Date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ProfessorEntryAt: isoLikeDateTimeSchema,
  ProfessorExitAt: isoLikeDateTimeSchema,
}).superRefine((value, ctx) => {
  if (!value.DebugReportOnly && value.Asistencia.length < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_small,
      minimum: 1,
      type: 'array',
      inclusive: true,
      path: ['Asistencia'],
      message: 'Debe enviar al menos una asistencia.',
    });
  }

  if (value.DebugReportOnly) {
    if (!value.Code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['Code'], message: 'Code es requerido en modo debug.' });
    }
    if (!value.Period) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['Period'], message: 'Period es requerido en modo debug.' });
    }
    if (!value.Date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['Date'], message: 'Date es requerido en modo debug.' });
    }
  }
});

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
