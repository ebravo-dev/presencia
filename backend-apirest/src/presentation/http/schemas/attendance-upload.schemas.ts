import { z } from 'zod';

const attendanceSchema = z.object({
  id_alumno: z.coerce.number().int().positive(),
  num_pase_lista: z.coerce.number().int().positive(),
  num_dia: z.coerce.number().int().min(1).max(7),
  sn_asistencia: z.boolean(),
});

const uploadRecordSchema = z.object({
  clientRecordId: z.string().min(1).max(160),
  Id_Grupo: z.coerce.number().int().positive(),
  Fec_Ini: z.string().min(1).max(30),
  Asistencia: z.array(attendanceSchema).min(1).max(500),
});

export const submitAttendanceBatchSchema = z.object({
  records: z.array(uploadRecordSchema).min(1).max(100),
}).superRefine(({ records }, context) => {
  const seen = new Set<string>();
  records.forEach((record, index) => {
    if (seen.has(record.clientRecordId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records', index, 'clientRecordId'],
        message: 'clientRecordId debe ser único dentro del lote.',
      });
    }
    seen.add(record.clientRecordId);
  });
});

export const attendanceBatchParamsSchema = z.object({ batchId: z.string().min(1) });
export const attendanceRecordStatusesSchema = z.object({
  clientRecordIds: z.array(z.string().min(1).max(160)).min(1).max(200),
});

export type SubmitAttendanceBatchBody = z.infer<typeof submitAttendanceBatchSchema>;
