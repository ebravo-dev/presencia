import { z } from 'zod';

export const teacherListSchema = z.object({
  coordinationId: z.string().trim().min(1).optional(), search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const teacherParamsSchema = z.object({ teacherId: z.string().trim().min(1) });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
export const weeklyReportSchema = z.object({
  teacherId: z.string().trim().min(1),
  weekStart: isoDate.refine((value) => new Date(`${value}T12:00:00Z`).getUTCDay() === 1, 'weekStart must be Monday'),
}).strict();
export const rangeReportSchema = z.object({ teacherId: z.string().trim().min(1), startDate: isoDate, endDate: isoDate })
  .strict()
  .refine((value) => value.startDate <= value.endDate, { path: ['endDate'], message: 'Invalid date range' })
  .refine((value) => (Date.parse(`${value.endDate}T00:00:00Z`) - Date.parse(`${value.startDate}T00:00:00Z`)) / 86_400_000 <= 366, {
    path: ['endDate'], message: 'Date range exceeds 366 days',
  });
