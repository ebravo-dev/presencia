import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';

/**
 * Schema for registering attendance.
 * Uses stable group identifiers (code + groupLetter + period) instead of
 * volatile DB CUIDs, so uploads survive DB resets or group re-creation.
 */
export const registerAttendanceSchema = z.object({
    code: z.string().min(1, 'Group code requerido'),
    groupLetter: z.string().min(1, 'Group letter requerido'),
    period: z.string().min(1, 'Period requerido'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD'),
    encryptedPassword: z.string().min(1, 'Encrypted password requerido'),
    forceUpload: z.boolean().optional(),
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
