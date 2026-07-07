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
import type { CoordinatorCreateInput, CoordinatorUpdateInput } from './super-user.schemas.js';

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
}
