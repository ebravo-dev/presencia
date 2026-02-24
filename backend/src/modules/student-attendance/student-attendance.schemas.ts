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
