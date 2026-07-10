import { prisma } from '../../core/database/prisma.js';

export const DEFAULT_TEACHER_ATTENDANCE_TOLERANCE_MINUTES = 10;
const TEACHER_TOLERANCE_KEY = 'attendance.teacherAttendanceToleranceMinutes';
const systemSetting = (prisma as any).systemSetting;

export interface AttendanceSettings {
    teacherAttendanceToleranceMinutes: number;
}

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
    const record = await systemSetting.findUnique({ where: { key: TEACHER_TOLERANCE_KEY } });
    const value = record?.value;
    return {
        teacherAttendanceToleranceMinutes: normalizeTolerance(
            typeof value === 'object' && value !== null && !Array.isArray(value)
                ? (value as Record<string, unknown>).teacherAttendanceToleranceMinutes
                : undefined,
        ),
    };
}

export async function updateAttendanceSettings(input: Partial<AttendanceSettings>): Promise<AttendanceSettings> {
    const settings = {
        teacherAttendanceToleranceMinutes: normalizeTolerance(input.teacherAttendanceToleranceMinutes),
    };

    await systemSetting.upsert({
        where: { key: TEACHER_TOLERANCE_KEY },
        create: { key: TEACHER_TOLERANCE_KEY, value: settings },
        update: { value: settings },
    });

    return settings;
}

function normalizeTolerance(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return DEFAULT_TEACHER_ATTENDANCE_TOLERANCE_MINUTES;
    return Math.max(0, Math.min(120, Math.round(parsed)));
}
