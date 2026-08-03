import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';

const optionalIsoDateTimeSchema = z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: 'Debe ser ISO datetime',
    })
    .optional();

/**
 * Schema for registering attendance.
 * Uses stable group identifiers (code + groupLetter + period) instead of
 * volatile DB CUIDs, so uploads survive DB resets or group re-creation.
 */
export const registerAttendanceSchema = z.object({
    groupId: z.string().min(1, 'Group ID requerido').optional(),
    code: z.string().min(1, 'Group code requerido'),
    groupLetter: z.string().min(1, 'Group letter requerido'),
    period: z.string().min(1, 'Period requerido'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD'),
    encryptedPassword: z.string().min(1, 'Encrypted password requerido'),
    forceUpload: z.boolean().optional(),
    professorEntryAt: optionalIsoDateTimeSchema,
    professorExitAt: optionalIsoDateTimeSchema,
    attendances: z.array(
        z.object({
            studentId: z.string().min(1, 'Student ID requerido'),
            status: z.nativeEnum(AttendanceStatus),
        })
    ).min(1, 'Se requiere al menos un alumno'),
});

export type RegisterAttendanceRequest = z.infer<typeof registerAttendanceSchema>;

export const professorBeaconEntrySchema = z.object({
    groupId: z.string().min(1, 'Group ID requerido').optional(),
    code: z.string().min(1, 'Group code requerido'),
    groupLetter: z.string().min(1, 'Group letter requerido'),
    period: z.string().min(1, 'Period requerido'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD'),
    detectedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
        message: 'detectedAt debe ser ISO datetime',
    }),
    beaconUuid: z.string().min(1, 'beaconUuid requerido'),
    rssi: z.number().int().optional(),
    distance: z.number().optional(),
    bluetoothAddress: z.string().optional(),
});

export type ProfessorBeaconEntryRequest = z.infer<typeof professorBeaconEntrySchema>;

export const professorExitSchema = z.object({
    groupId: z.string().min(1, 'Group ID requerido').optional(),
    code: z.string().min(1, 'Group code requerido'),
    groupLetter: z.string().min(1, 'Group letter requerido'),
    period: z.string().min(1, 'Period requerido'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD'),
    detectedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
        message: 'detectedAt debe ser ISO datetime',
    }),
});

export type ProfessorExitRequest = z.infer<typeof professorExitSchema>;

export const studentBeaconDetectionsSchema = z.object({
    groupId: z.string().min(1, 'Group ID requerido').optional(),
    code: z.string().min(1, 'Group code requerido'),
    groupLetter: z.string().min(1, 'Group letter requerido'),
    period: z.string().min(1, 'Period requerido'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD'),
    detections: z.array(
        z.object({
            beaconUuid: z.string().min(1, 'beaconUuid requerido'),
            detectedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
                message: 'detectedAt debe ser ISO datetime',
            }),
            rssi: z.number().int().optional(),
            distance: z.number().optional(),
            txPower: z.number().int().optional(),
            bluetoothAddress: z.string().optional(),
            major: z.number().int().optional(),
            minor: z.number().int().optional(),
        })
    ).min(1, 'detections requerido'),
});

export type StudentBeaconDetectionsRequest = z.infer<typeof studentBeaconDetectionsSchema>;

export const studentBeaconBindingsSchema = z.object({
    groupId: z.string().min(1, 'Group ID requerido').optional(),
    code: z.string().min(1, 'Group code requerido'),
    groupLetter: z.string().min(1, 'Group letter requerido'),
    period: z.string().min(1, 'Period requerido'),
});

export type StudentBeaconBindingsRequest = z.infer<typeof studentBeaconBindingsSchema>;


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
