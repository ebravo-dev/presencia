import { z } from 'zod';
import { ApiError } from '../../../errors/api-error.js';

export const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
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

export const sessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export function parsePayload<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Solicitud invalida.', result.error.flatten());
  }

  return result.data;
}
