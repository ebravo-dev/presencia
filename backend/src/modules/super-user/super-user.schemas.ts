import { z } from 'zod';
import { beaconSchema, beaconUpdateSchema } from '../beacons/beacons.service.js';

export const superUserLoginSchema = z.object({
    password: z.string().min(1),
});

export const coordinatorCreateSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(8),
    role: z.enum(['COORDINATOR', 'READ_ONLY']),
});

export const coordinatorUpdateSchema = z.object({
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
    password: z.string().min(8).optional(),
    role: z.enum(['COORDINATOR', 'READ_ONLY']).optional(),
    disabled: z.boolean().optional(),
});

export const superUserBeaconSchema = beaconSchema;
export const superUserBeaconUpdateSchema = beaconUpdateSchema;

export const debugClassStudentSchema = z.object({
    matricula: z.string().trim().min(1),
    name: z.string().trim().min(1),
    attendanceUuid: z.string().trim().min(8),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida, usa HH:mm');
const debugClassScheduleSlotSchema = z.object({
    startTime: timeSchema,
    endTime: timeSchema,
}).refine((slot) => minutesOfDay(slot.endTime) > minutesOfDay(slot.startTime), {
    message: 'La hora de salida debe ser mayor que la hora de entrada',
});

export const debugClassScheduleSchema = z.object({
    monday: z.array(debugClassScheduleSlotSchema).optional(),
    tuesday: z.array(debugClassScheduleSlotSchema).optional(),
    wednesday: z.array(debugClassScheduleSlotSchema).optional(),
    thursday: z.array(debugClassScheduleSlotSchema).optional(),
    friday: z.array(debugClassScheduleSlotSchema).optional(),
    saturday: z.array(debugClassScheduleSlotSchema).optional(),
    sunday: z.array(debugClassScheduleSlotSchema).optional(),
}).refine((schedule) => Object.values(schedule).some((slots) => Array.isArray(slots) && slots.length > 0), {
    message: 'Configura al menos un día con horario',
});

export const debugClassCreateSchema = z.object({
    professorEmail: z.string().email(),
    professorName: z.string().trim().min(1).optional(),
    code: z.string().trim().min(1).default('990001'),
    groupLetter: z.string().trim().default('DBG'),
    period: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).default('DEBUG ASISTENCIA'),
    level: z.string().trim().min(1).default('DEBUG'),
    classroom: z.string().trim().min(1).default('DEBUG-101'),
    beaconUuid: z.string().trim().min(8).default('11111111-2222-4333-8444-555555555555'),
    schedule: debugClassScheduleSchema.optional(),
    students: z.array(debugClassStudentSchema).min(1).max(80).optional(),
});

export const debugClassUpdateSchema = z.object({
    code: z.string().trim().min(1).optional(),
    groupLetter: z.string().trim().optional(),
    period: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    level: z.string().trim().min(1).optional(),
    classroom: z.string().trim().min(1).optional(),
    beaconUuid: z.string().trim().min(8).optional(),
    schedule: debugClassScheduleSchema.optional(),
});

export const debugSettingsUpdateSchema = z.object({
    teacherAttendanceToleranceMinutes: z.number().int().min(0).max(120),
});

export type CoordinatorCreateInput = z.infer<typeof coordinatorCreateSchema>;
export type CoordinatorUpdateInput = z.infer<typeof coordinatorUpdateSchema>;
export type DebugClassCreateInput = z.infer<typeof debugClassCreateSchema>;
export type DebugClassUpdateInput = z.infer<typeof debugClassUpdateSchema>;
export type DebugSettingsUpdateInput = z.infer<typeof debugSettingsUpdateSchema>;

function minutesOfDay(value: string): number {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
}
