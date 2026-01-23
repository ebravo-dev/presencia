import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';

/**
 * Schema for registering attendance
 */
export const registerAttendanceSchema = z.object({
    groupId: z.string().min(1, 'Group ID requerido'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD'),
    attendances: z.array(
        z.object({
            studentId: z.string().min(1, 'Student ID requerido'),
            status: z.nativeEnum(AttendanceStatus),
        })
    ),
});

export type RegisterAttendanceRequest = z.infer<typeof registerAttendanceSchema>;

/**
 * Query params for attendance history
 */
export const attendanceHistoryQuerySchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().min(1).max(100).default(30),
    offset: z.coerce.number().min(0).default(0),
});

export type AttendanceHistoryQuery = z.infer<typeof attendanceHistoryQuerySchema>;
