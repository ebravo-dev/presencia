import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../core/config/env.js';
import { prisma } from '../../core/database/prisma.js';
import type { BeaconInput, BeaconUpdateInput } from '../beacons/beacons.service.js';
import {
    getAttendanceSettings,
    updateAttendanceSettings,
} from '../settings/attendance-settings.service.js';
import type { CoordinatorCreateInput, CoordinatorUpdateInput, DebugClassCreateInput, DebugClassUpdateInput, DebugSettingsUpdateInput } from './super-user.schemas.js';
import { AttendanceServiceCommandClient } from './attendance-service-command.client.js';

const studentDeviceBinding = (prisma as any).studentDeviceBinding;
const DEBUG_DAY_ALIASES = {
    monday: ['monday', 'lunes'],
    tuesday: ['tuesday', 'martes'],
    wednesday: ['wednesday', 'miercoles'],
    thursday: ['thursday', 'jueves'],
    friday: ['friday', 'viernes'],
    saturday: ['saturday', 'sabado'],
    sunday: ['sunday', 'domingo'],
} as const;

export interface SuperUserIdentity {
    role: 'SUPER_USER';
}

interface SuperUserJwtPayload extends jwt.JwtPayload {
    role: 'SUPER_USER';
}

export class SuperUserService {
    readonly sessionDurationSeconds = 4 * 60 * 60;
    private readonly attendanceCommands = env.ATTENDANCE_SERVICE_URL
        ? new AttendanceServiceCommandClient(env.ATTENDANCE_SERVICE_URL, env.INTERNAL_API_TOKEN)
        : undefined;

    login(password: string): { token: string; user: SuperUserIdentity; expiresAt: Date } {
        if (!this.passwordMatches(password)) {
            throw new Error('INVALID_SUPER_USER_PASSWORD');
        }

        const expiresAt = new Date(Date.now() + this.sessionDurationSeconds * 1000);
        const token = jwt.sign({ role: 'SUPER_USER' }, env.JWT_SECRET, {
            subject: 'superUsuario',
            expiresIn: this.sessionDurationSeconds,
            issuer: 'presencia-backend',
        });

        return { token, expiresAt, user: { role: 'SUPER_USER' } };
    }

    authenticate(token?: string): SuperUserIdentity | null {
        if (!token) return null;

        try {
            const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'presencia-backend' }) as SuperUserJwtPayload;
            if (payload.sub !== 'superUsuario' || payload.role !== 'SUPER_USER') return null;
            return { role: 'SUPER_USER' };
        } catch {
            return null;
        }
    }

    listCoordinators() {
        return this.requestCoordinationApi('/api/internal/coordinacion/coordinadores');
    }

    createCoordinator(input: CoordinatorCreateInput) {
        return this.requestCoordinationApi('/api/internal/coordinacion/coordinadores', {
            method: 'POST',
            body: input,
        });
    }

    updateCoordinator(id: string, input: CoordinatorUpdateInput) {
        return this.requestCoordinationApi(`/api/internal/coordinacion/coordinadores/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: input,
        });
    }

    async deleteCoordinator(id: string): Promise<void> {
        await this.requestCoordinationApi(`/api/internal/coordinacion/coordinadores/${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
    }

    listBeacons() {
        if (!this.attendanceCommands) throw Object.assign(new Error('ATTENDANCE_SERVICE_REQUIRED'), { statusCode: 503 });
        return this.attendanceCommands.listClassroomBeacons().then(({ data }) => data);
    }

    async createBeacon(input: BeaconInput) {
        if (!this.attendanceCommands) throw Object.assign(new Error('ATTENDANCE_SERVICE_REQUIRED'), { statusCode: 503 });
        const response = await this.attendanceCommands.createClassroomBeacon({
            ...input, actorIdentityId: 'super-user:dashboard', actorRole: 'SUPER_USER',
            reason: 'Alta de beacon desde super usuario.', correlationId: 'super-user-dashboard',
        });
        return response.data;
    }

    async updateBeacon(id: string, input: BeaconUpdateInput) {
        if (!this.attendanceCommands) throw Object.assign(new Error('ATTENDANCE_SERVICE_REQUIRED'), { statusCode: 503 });
        const response = await this.attendanceCommands.updateClassroomBeacon(id, {
            ...input, actorIdentityId: 'super-user:dashboard', actorRole: 'SUPER_USER',
            reason: 'Actualización de beacon desde super usuario.', correlationId: 'super-user-dashboard',
        });
        return response.data;
    }

    async deleteBeacon(id: string) {
        if (!this.attendanceCommands) throw Object.assign(new Error('ATTENDANCE_SERVICE_REQUIRED'), { statusCode: 503 });
        await this.attendanceCommands.deleteClassroomBeacon(id, {
            actorIdentityId: 'super-user:dashboard', actorRole: 'SUPER_USER',
            reason: 'Baja de beacon desde super usuario.', correlationId: 'super-user-dashboard',
        });
    }

    async listStudentDeviceBindings(q?: string) {
        const normalizedQuery = q?.trim().toUpperCase();
        const bindings = await studentDeviceBinding.findMany({
            where: normalizedQuery
                ? {
                    matricula: {
                        contains: normalizedQuery,
                    },
                }
                : undefined,
            orderBy: { updatedAt: 'desc' },
            take: 500,
        });

        const matriculas = bindings.map((binding: { matricula: string }) => binding.matricula);
        const students = await prisma.student.findMany({
            where: { matricula: { in: matriculas } },
            select: {
                id: true,
                matricula: true,
                name: true,
                group: {
                    select: {
                        code: true,
                        groupLetter: true,
                        name: true,
                        classroom: true,
                        period: true,
                        professor: {
                            select: {
                                name: true,
                                institutionalEmail: true,
                            },
                        },
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        const studentsByMatricula = new Map<string, typeof students>();
        for (const student of students) {
            const list = studentsByMatricula.get(student.matricula) ?? [];
            list.push(student);
            studentsByMatricula.set(student.matricula, list);
        }

        return bindings.map((binding: {
            id: string;
            matricula: string;
            attendanceUuid: string;
            deviceBindingId?: string | null;
            platform?: string | null;
            deviceInfo?: string | null;
            createdAt: Date;
            updatedAt: Date;
        }) => ({
            ...binding,
            students: studentsByMatricula.get(binding.matricula) ?? [],
        }));
    }

    async deleteStudentDeviceBinding(matriculaInput: string, correlationId = 'super-user-dashboard'): Promise<boolean> {
        const matricula = matriculaInput.trim().toUpperCase();
        let authoritativeCommandSent = false;
        if (this.attendanceCommands) {
            await this.attendanceCommands.unbindStudentDevice({
                matricula,
                actorIdentityId: 'super-user:dashboard',
                actorRole: 'SUPER_USER',
                reason: 'Desvinculación solicitada desde el dashboard de coordinación.',
                correlationId,
            });
            authoritativeCommandSent = true;
        }
        const deleted = await studentDeviceBinding.deleteMany({
            where: { matricula },
        });

        if (deleted.count === 0) return authoritativeCommandSent;

        await prisma.student.updateMany({
            where: { matricula },
            data: { beaconUuid: null },
        });

        return true;
    }

    async getDebugStatus() {
        const settings = await getAttendanceSettings();
        return {
            data: {
                enabled: env.PRESENCIA_DEBUG_MODE,
                period: env.PRESENCIA_DEBUG_PERIOD,
                settings,
                apiRestPolicy: env.PRESENCIA_DEBUG_MODE
                    ? 'Solo login. Scraping, consultas y subida real deshabilitadas.'
                    : 'Flujo real habilitado.',
            },
            meta: { generatedAt: new Date().toISOString() },
        };
    }

    async getDebugSettings() {
        return {
            data: await getAttendanceSettings(),
            meta: { generatedAt: new Date().toISOString() },
        };
    }

    async updateDebugSettings(input: DebugSettingsUpdateInput) {
        return {
            data: await updateAttendanceSettings(input),
            meta: { generatedAt: new Date().toISOString() },
        };
    }

    async listDebugClasses() {
        const groups = await prisma.group.findMany({
            where: {
                OR: [
                    { level: 'DEBUG' },
                    { code: { startsWith: '990' } },
                    { classroom: { startsWith: 'DEBUG' } },
                ],
            },
            include: {
                professor: { select: { id: true, name: true, institutionalEmail: true } },
                students: { orderBy: { name: 'asc' } },
                attendanceRecords: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    include: { attendances: true, studentBeaconDetections: true },
                },
            },
            orderBy: [{ updatedAt: 'desc' }],
            take: 500,
        });

        return { data: groups, meta: { generatedAt: new Date().toISOString() } };
    }

    async createDebugClass(input: DebugClassCreateInput) {
        const period = input.period ?? env.PRESENCIA_DEBUG_PERIOD;
        const professor = await prisma.professor.upsert({
            where: { institutionalEmail: input.professorEmail },
            create: {
                institutionalEmail: input.professorEmail,
                name: input.professorName ?? input.professorEmail.split('@')[0],
                lastSyncPeriod: period,
            },
            update: {
                name: input.professorName ?? input.professorEmail.split('@')[0],
                lastSyncPeriod: period,
            },
        });

        await prisma.beacon.upsert({
            where: { uuid: input.beaconUuid },
            create: { uuid: input.beaconUuid, classroom: input.classroom },
            update: { classroom: input.classroom },
        });

        const schedule = this.normalizeDebugSchedule(input.schedule ?? this.defaultDebugSchedule()) as any;
        const code = await this.resolveDebugClassCode({
            requestedCode: input.code,
            groupLetter: input.groupLetter,
            professorId: professor.id,
            period,
        });
        const group = await prisma.group.create({
            data: {
                code,
                groupLetter: input.groupLetter,
                period,
                name: input.name,
                level: input.level,
                classroom: input.classroom,
                schedule,
                professorId: professor.id,
            },
        });

        const students = input.students ?? this.defaultDebugStudents();
        for (const student of students) {
            await prisma.student.upsert({
                where: {
                    matricula_groupId: {
                        matricula: student.matricula.toUpperCase(),
                        groupId: group.id,
                    },
                },
                create: {
                    matricula: student.matricula.toUpperCase(),
                    name: student.name,
                    beaconUuid: student.attendanceUuid,
                    groupId: group.id,
                },
                update: {
                    name: student.name,
                    beaconUuid: student.attendanceUuid,
                },
            });

            await studentDeviceBinding.upsert({
                where: { matricula: student.matricula.toUpperCase() },
                create: {
                    matricula: student.matricula.toUpperCase(),
                    attendanceUuid: student.attendanceUuid,
                    deviceBindingId: `debug-${student.matricula.toLowerCase()}`,
                    platform: 'debug',
                    deviceInfo: 'Vinculación generada desde SuperUsuario debug',
                },
                update: {
                    attendanceUuid: student.attendanceUuid,
                    deviceBindingId: `debug-${student.matricula.toLowerCase()}`,
                    platform: 'debug',
                    deviceInfo: 'Vinculación generada desde SuperUsuario debug',
                },
            });
        }

        return {
            data: {
                professor,
                group,
                studentsCount: students.length,
            },
        };
    }

    async updateDebugClass(id: string, input: DebugClassUpdateInput) {
        const current = await prisma.group.findFirst({
            where: {
                id,
                OR: [
                    { level: 'DEBUG' },
                    { code: { startsWith: '990' } },
                    { classroom: { startsWith: 'DEBUG' } },
                ],
            },
        });
        if (!current) return null;

        const classroom = input.classroom ?? current.classroom;
        if (input.beaconUuid) {
            await prisma.beacon.upsert({
                where: { uuid: input.beaconUuid },
                create: { uuid: input.beaconUuid, classroom },
                update: { classroom },
            });
        }

        const group = await prisma.group.update({
            where: { id },
            data: {
                code: input.code ?? current.code,
                groupLetter: input.groupLetter ?? current.groupLetter,
                period: input.period ?? current.period,
                name: input.name ?? current.name,
                level: input.level ?? current.level,
                classroom,
                schedule: input.schedule === undefined ? current.schedule as any : this.normalizeDebugSchedule(input.schedule) as any,
            },
            include: {
                professor: { select: { id: true, name: true, institutionalEmail: true } },
                students: { orderBy: { name: 'asc' } },
                attendanceRecords: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    include: { attendances: true, studentBeaconDetections: true },
                },
            },
        });

        return { data: group, meta: { generatedAt: new Date().toISOString() } };
    }

    async listDebugStudentAttendance() {
        const records = await prisma.attendanceRecord.findMany({
            include: {
                professor: { select: { id: true, name: true, institutionalEmail: true } },
                group: { select: { id: true, code: true, groupLetter: true, period: true, name: true, classroom: true } },
                attendances: {
                    include: {
                        student: { select: { id: true, matricula: true, name: true, beaconUuid: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
                studentBeaconDetections: {
                    include: {
                        student: { select: { id: true, matricula: true, name: true } },
                    },
                    orderBy: { detectedAt: 'desc' },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        return { data: records, meta: { generatedAt: new Date().toISOString() } };
    }

    async listDebugFlowLogs() {
        const [syncJobs, attendanceRecords, recentBindings] = await Promise.all([
            prisma.syncJob.findMany({
                include: { professor: { select: { id: true, name: true, institutionalEmail: true } } },
                orderBy: { startedAt: 'desc' },
                take: 80,
            }),
            prisma.attendanceRecord.findMany({
                include: {
                    professor: { select: { id: true, name: true, institutionalEmail: true } },
                    group: { select: { id: true, code: true, groupLetter: true, period: true, name: true, classroom: true } },
                    _count: { select: { attendances: true, studentBeaconDetections: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 80,
            }),
            studentDeviceBinding.findMany({
                orderBy: { updatedAt: 'desc' },
                take: 40,
            }),
        ]);

        return {
            data: {
                syncJobs,
                attendanceRecords,
                recentBindings,
            },
            meta: { generatedAt: new Date().toISOString() },
        };
    }

    private passwordMatches(candidate: string): boolean {
        const expected = Buffer.from(env.SUPER_USER_PASSWORD);
        const actual = Buffer.from(candidate);
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    }

    private async requestCoordinationApi(path: string, options: { method?: string; body?: unknown } = {}) {
        const response = await fetch(`${env.BACKEND_API_REST_URL.replace(/\/+$/, '')}${path}`, {
            method: options.method ?? 'GET',
            headers: {
                Authorization: `Bearer ${env.INTERNAL_API_TOKEN}`,
                ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });

        if (response.status === 204) return undefined;

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw Object.assign(new Error(payload.message ?? 'Error del servicio interno de coordinacion'), {
                statusCode: response.status,
                payload,
            });
        }

        return payload;
    }

    private defaultDebugSchedule() {
        const duration = Math.max(1, env.PRESENCIA_DEBUG_CLASS_HOURS || env.DEBUG_EXTRA_CLASS_HOURS);
        const endHour = Math.min(23, 8 + duration);
        const value = [{ startTime: '08:00', endTime: `${String(endHour).padStart(2, '0')}:00` }];
        return {
            monday: value,
            tuesday: value,
            wednesday: value,
            thursday: value,
            friday: value,
        };
    }

    private normalizeDebugSchedule(schedule: Record<string, unknown>) {
        const normalized: Record<string, Array<{ raw: string; startTime: string; endTime: string }>> = {};
        for (const [day, aliases] of Object.entries(DEBUG_DAY_ALIASES)) {
            const source = aliases.map((alias) => schedule[alias]).find((value) => value !== undefined);
            const slots = this.normalizeDebugDaySlots(source);
            for (const alias of aliases) {
                normalized[alias] = slots;
            }
        }
        return normalized;
    }

    private normalizeDebugDaySlots(value: unknown): Array<{ raw: string; startTime: string; endTime: string }> {
        if (Array.isArray(value)) {
            return value
                .map((item) => {
                    if (typeof item === 'string') return this.parseScheduleSlot(item);
                    if (typeof item !== 'object' || item === null) return null;
                    const record = item as { startTime?: unknown; endTime?: unknown };
                    const startTime = typeof record.startTime === 'string' ? record.startTime : null;
                    const endTime = typeof record.endTime === 'string' ? record.endTime : null;
                    return startTime && endTime ? { raw: `${startTime}-${endTime}`, startTime, endTime } : null;
                })
                .filter((item): item is { raw: string; startTime: string; endTime: string } => item !== null);
        }

        if (typeof value === 'string') {
            return value
                .split(/[;\n]+/)
                .map((item) => this.parseScheduleSlot(item))
                .filter((item): item is { raw: string; startTime: string; endTime: string } => item !== null);
        }

        return [];
    }

    private async resolveDebugClassCode(input: {
        requestedCode: string;
        groupLetter: string;
        professorId: string;
        period: string;
    }): Promise<string> {
        let candidate = input.requestedCode;
        for (let attempt = 0; attempt < 10_000; attempt += 1) {
            const existing = await prisma.group.findUnique({
                where: {
                    code_groupLetter_professorId_period: {
                        code: candidate,
                        groupLetter: input.groupLetter,
                        professorId: input.professorId,
                        period: input.period,
                    },
                },
                select: { id: true },
            });
            if (!existing) return candidate;
            candidate = this.nextDebugClassCode(candidate);
        }

        return `${input.requestedCode}-${Date.now()}`;
    }

    private nextDebugClassCode(code: string): string {
        const match = code.match(/^(.*?)(\d+)$/);
        if (!match) return `${code}-2`;
        const [, prefix, numeric] = match;
        return `${prefix}${String(Number(numeric) + 1).padStart(numeric.length, '0')}`;
    }

    private parseScheduleSlot(value: string): { raw: string; startTime: string; endTime: string } | null {
        const trimmed = value.trim();
        const match = trimmed.match(/\b([0-2]?\d:[0-5]\d)\s*(?:-|a)\s*([0-2]?\d:[0-5]\d)\b/i);
        if (!match?.[1] || !match[2]) return null;
        const startTime = this.padTime(match[1]);
        const endTime = this.padTime(match[2]);
        return { raw: `${startTime}-${endTime}`, startTime, endTime };
    }

    private padTime(value: string): string {
        const [hours, minutes] = value.split(':');
        return `${hours.padStart(2, '0')}:${minutes}`;
    }

    private defaultDebugStudents() {
        return [
            { matricula: 'DBG0001', name: 'Alumno Debug Uno', attendanceUuid: '22222222-0001-4333-8444-555555555555' },
            { matricula: 'DBG0002', name: 'Alumno Debug Dos', attendanceUuid: '22222222-0002-4333-8444-555555555555' },
            { matricula: 'DBG0003', name: 'Alumno Debug Tres', attendanceUuid: '22222222-0003-4333-8444-555555555555' },
            { matricula: 'DBG0004', name: 'Alumno Debug Cuatro', attendanceUuid: '22222222-0004-4333-8444-555555555555' },
        ];
    }
}
