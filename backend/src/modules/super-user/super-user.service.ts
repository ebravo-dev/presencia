import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../core/config/env.js';
import { prisma } from '../../core/database/prisma.js';
import {
    createBeacon,
    deleteBeacon,
    findBeaconByClassroom,
    listBeacons,
    updateBeacon,
    BeaconInput,
    BeaconUpdateInput,
} from '../beacons/beacons.service.js';
import type { CoordinatorCreateInput, CoordinatorUpdateInput, DebugClassCreateInput } from './super-user.schemas.js';

const studentDeviceBinding = (prisma as any).studentDeviceBinding;

export interface SuperUserIdentity {
    role: 'SUPER_USER';
}

interface SuperUserJwtPayload extends jwt.JwtPayload {
    role: 'SUPER_USER';
}

export class SuperUserService {
    readonly sessionDurationSeconds = 4 * 60 * 60;

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
        return listBeacons();
    }

    async createBeacon(input: BeaconInput) {
        const existingClassroom = await findBeaconByClassroom(input.classroom);
        if (existingClassroom) {
            throw Object.assign(new Error('BEACON_CLASSROOM_EXISTS'), { statusCode: 409 });
        }
        return createBeacon(input);
    }

    async updateBeacon(id: string, input: BeaconUpdateInput) {
        if (input.classroom) {
            const existingClassroom = await findBeaconByClassroom(input.classroom, id);
            if (existingClassroom) {
                throw Object.assign(new Error('BEACON_CLASSROOM_EXISTS'), { statusCode: 409 });
            }
        }
        return updateBeacon(id, input);
    }

    deleteBeacon(id: string) {
        return deleteBeacon(id);
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

    async deleteStudentDeviceBinding(matriculaInput: string): Promise<boolean> {
        const matricula = matriculaInput.trim().toUpperCase();
        const deleted = await studentDeviceBinding.deleteMany({
            where: { matricula },
        });

        if (deleted.count === 0) return false;

        await prisma.student.updateMany({
            where: { matricula },
            data: { beaconUuid: null },
        });

        return true;
    }

    getDebugStatus() {
        return {
            data: {
                enabled: env.PRESENCIA_DEBUG_MODE,
                period: env.PRESENCIA_DEBUG_PERIOD,
                classHours: env.PRESENCIA_DEBUG_CLASS_HOURS || env.DEBUG_EXTRA_CLASS_HOURS,
                apiRestPolicy: env.PRESENCIA_DEBUG_MODE
                    ? 'Solo login. Scraping, consultas y subida real deshabilitadas.'
                    : 'Flujo real habilitado.',
            },
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
            take: 100,
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

        const schedule = (input.schedule ?? this.defaultDebugSchedule()) as any;
        const group = await prisma.group.upsert({
            where: {
                code_groupLetter_professorId_period: {
                    code: input.code,
                    groupLetter: input.groupLetter,
                    professorId: professor.id,
                    period,
                },
            },
            create: {
                code: input.code,
                groupLetter: input.groupLetter,
                period,
                name: input.name,
                level: input.level,
                classroom: input.classroom,
                schedule,
                professorId: professor.id,
            },
            update: {
                name: input.name,
                level: input.level,
                classroom: input.classroom,
                schedule,
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
        const value = `08:00-${String(8 + duration).padStart(2, '0')}:00`;
        return {
            monday: value,
            lunes: value,
            tuesday: value,
            martes: value,
            wednesday: value,
            miercoles: value,
            thursday: value,
            jueves: value,
            friday: value,
            viernes: value,
        };
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
