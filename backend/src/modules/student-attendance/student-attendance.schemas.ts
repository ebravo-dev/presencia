import { z } from 'zod';

// Schema for a single student BLE attendance record
export const studentBleAttendanceSchema = z.object({
    studentName: z.string().min(1, 'studentName is required'),
    matricula: z.string().min(1, 'matricula is required'),
    beaconId: z.string().min(1, 'beaconId is required'),
    detectedAt: z.string().datetime({ message: 'detectedAt must be a valid ISO datetime' }),
    deviceInfo: z.string().optional(),
});

// Schema for batch upload
export const studentBleAttendanceBatchSchema = z.object({
    records: z.array(studentBleAttendanceSchema).min(1, 'At least one record is required'),
});

export type StudentBleAttendanceInput = z.infer<typeof studentBleAttendanceSchema>;

export const studentDeviceBindingSchema = z.object({
    matricula: z.string().min(1, 'matricula is required').transform((value) => value.trim().toUpperCase()),
    attendanceUuid: z.string().uuid('attendanceUuid must be a valid UUID'),
    deviceBindingId: z.string().uuid('deviceBindingId must be a valid UUID').optional(),
    platform: z.string().max(40).optional(),
    deviceInfo: z.string().max(500).optional(),
});

export type StudentDeviceBindingInput = z.infer<typeof studentDeviceBindingSchema>;

export const studentDeviceBindingResolveSchema = z.object({
    matriculas: z.array(
        z.string().min(1).transform((value) => value.trim().toUpperCase())
    ).min(1, 'At least one matricula is required'),
});

export type StudentDeviceBindingResolveInput = z.infer<typeof studentDeviceBindingResolveSchema>;
