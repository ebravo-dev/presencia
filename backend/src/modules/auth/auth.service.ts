import { prisma } from '../../core/database/prisma.js';
import { rsaService, jwtService, sessionService } from '../../core/security/index.js';
import type { LoginRequest, AuthResponse } from './auth.schemas.js';
import { uatRestSyncService } from '../uat-rest/index.js';
import { env } from '../../core/config/env.js';
import { uatRestClient } from '../uat-rest/uat-rest.client.js';

const studentDeviceBinding = (prisma as any).studentDeviceBinding;

/**
 * Calculate the current academic period based on date
 * Format matches UAT portal: "2026 - 1 PRIMAVERA", "2026 - 2 VERANO", "2026 - 3 OTOÑO"
 * Enero-Mayo = 1 PRIMAVERA, Junio-Julio = 2 VERANO, Agosto-Diciembre = 3 OTOÑO
 */
export function calculateCurrentPeriod(date: Date = new Date()): string {
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();

    if (month >= 1 && month <= 5) return `${year} - 1 PRIMAVERA`;
    if (month >= 6 && month <= 7) return `${year} - 2 VERANO`;
    return `${year} - 3 OTOÑO`;
}

export class AuthService {
    /**
     * Login a professor (creates account if doesn't exist - upsert behavior)
     * - Validates credentials against UAT through backend-apirest
     * - Creates professor in database if first time
     * - Only triggers scraping if period changed
     */
    async login(data: LoginRequest): Promise<AuthResponse> {
        // Decrypt password (only in memory)
        const decryptedPassword = rsaService.decryptPasswordOrPlain(data.encryptedPassword);

        // Calculate current period
        const activeCycle = env.PRESENCIA_DEBUG_MODE
            ? { externalId: env.UAT_ID_CICLO_ESCOLAR, name: env.PRESENCIA_DEBUG_PERIOD }
            : (await uatRestClient.getActiveAcademicCycle()).data.active;
        const currentPeriod = activeCycle.name;

        const debugLogin = env.PRESENCIA_DEBUG_MODE
            ? await this.validateLoginOnly(data.institutionalEmail, decryptedPassword)
            : null;

        // Find or create professor (upsert behavior)
        let professor = await prisma.professor.findUnique({
            where: { institutionalEmail: data.institutionalEmail },
        });

        const isNewProfessor = !professor;

        if (isNewProfessor) {
            // Create new professor - name will be updated by backend-apirest sync
            professor = await prisma.professor.create({
                data: {
                    institutionalEmail: data.institutionalEmail,
                    name: debugLogin?.professorName ?? data.institutionalEmail.split('@')[0], // Temporary name from email
                    lastSyncPeriod: currentPeriod,
                },
            });
        } else if (professor && debugLogin?.professorName && professor.name !== debugLogin.professorName) {
            professor = await prisma.professor.update({
                where: { id: professor.id },
                data: { name: debugLogin.professorName },
            });
        }

        // At this point professor is guaranteed to exist
        const prof = professor!;
        // Check if professor has any groups in current period
        const groupCount = await prisma.group.count({
            where: { professorId: prof.id, period: currentPeriod }
        });
        const hasNoGroups = groupCount === 0;

        // Generate session and JWT token
        const sessionId = await sessionService.createSession(prof.id);
        const token = jwtService.sign({
            professorId: prof.id,
            email: prof.institutionalEmail,
            sessionId,
        });

        if (env.PRESENCIA_DEBUG_MODE) {
            const seed = await this.ensureDebugProfessorData(prof.id, currentPeriod);
            return {
                token,
                profesor: {
                    id: prof.id,
                    institutionalEmail: prof.institutionalEmail,
                    name: debugLogin?.professorName ?? prof.name,
                },
                message: `Modo debug activo. Login validado; usando ${seed.groupsCount} materia(s) y ${seed.studentsCount} alumno(s) de prueba.`,
                currentPeriod,
                needsSync: false,
            };
        }

        // Only sync if professor has NO groups in current period
        // (first login or new academic period). Returning professors
        // use "Sincronizar Ciclo" button to refresh their classes.
        const shouldSync = hasNoGroups;

        if (shouldSync) {
            // Update lastSyncPeriod
            await prisma.professor.update({
                where: { id: prof.id },
                data: { lastSyncPeriod: currentPeriod },
            });

            await uatRestSyncService.syncProfessor({
                professorId: prof.id,
                email: data.institutionalEmail,
                password: decryptedPassword,
                currentPeriod,
                cycleExternalId: activeCycle.externalId,
            });
        }

        return {
            token,
            profesor: {
                id: prof.id,
                institutionalEmail: prof.institutionalEmail,
                name: prof.name,
            },
            message: shouldSync
                ? 'Login exitoso. Sincronizando grupos...'
                : 'Login exitoso.',
            currentPeriod,
            needsSync: shouldSync,
        };
    }

    /**
     * Get professor by ID
     */
    async getProfessor(professorId: string) {
        return prisma.professor.findUnique({
            where: { id: professorId },
        });
    }

    /**
     * Force sync groups for a professor
     */
    async forceSync(
        professorId: string,
        email: string,
        encryptedPassword: string
    ): Promise<{ message: string; currentPeriod: string }> {
        console.log(`🔄 forceSync called for professor ${professorId}`);
        const decryptedPassword = rsaService.decryptPasswordOrPlain(encryptedPassword);
        const activeCycle = env.PRESENCIA_DEBUG_MODE
            ? { externalId: env.UAT_ID_CICLO_ESCOLAR, name: env.PRESENCIA_DEBUG_PERIOD }
            : (await uatRestClient.getActiveAcademicCycle()).data.active;
        const currentPeriod = activeCycle.name;

        if (env.PRESENCIA_DEBUG_MODE) {
            const seed = await this.ensureDebugProfessorData(professorId, currentPeriod);
            return {
                message: `Modo debug activo. Sincronización real deshabilitada; datos locales de prueba listos (${seed.groupsCount} materia(s), ${seed.studentsCount} alumno(s)).`,
                currentPeriod,
            };
        }

        // Block sync if there are pending attendance uploads
        const pendingUploads = await prisma.attendanceRecord.count({
            where: {
                professorId,
                portalSyncStatus: { in: ['PENDING', 'IN_PROGRESS'] },
            },
        });

        if (pendingUploads > 0) {
            return {
                message: `No puedes sincronizar mientras hay ${pendingUploads} asistencia(s) pendiente(s) de subir al portal. Espera a que terminen.`,
                currentPeriod,
            };
        }

        // Check if there's already a sync in progress
        const existingSync = await prisma.syncJob.findFirst({
            where: {
                professorId,
                status: { in: ['PENDING', 'IN_PROGRESS'] },
            },
        });

        if (existingSync) {
            console.log(`⚠️ Found existing sync: ${existingSync.id} status=${existingSync.status} started=${existingSync.startedAt}`);

            // If sync has been stuck for more than 10 minutes, mark it as failed and continue
            const stuckThreshold = 10 * 60 * 1000; // 10 minutes
            const syncAge = existingSync.startedAt
                ? Date.now() - existingSync.startedAt.getTime()
                : 0;

            if (syncAge > stuckThreshold) {
                console.log(`🔧 Sync stuck for ${Math.round(syncAge / 60000)} minutes, marking as FAILED`);
                await prisma.syncJob.update({
                    where: { id: existingSync.id },
                    data: {
                        status: 'FAILED',
                        error: 'Sincronización cancelada (timeout automático)',
                        completedAt: new Date(),
                    },
                });
            } else {
                return {
                    message: 'Ya hay una sincronización en proceso. Espera a que termine.',
                    currentPeriod,
                };
            }
        }

        // Update lastSyncPeriod
        await prisma.professor.update({
            where: { id: professorId },
            data: { lastSyncPeriod: currentPeriod },
        });

        console.log(`📤 Syncing professor through backend-apirest for ${email}`);
        await uatRestSyncService.syncProfessor({
            professorId,
            email,
            password: decryptedPassword,
            currentPeriod,
            cycleExternalId: activeCycle.externalId,
        });

        return {
            message: 'Sincronización completada.',
            currentPeriod,
        };
    }

    private async validateLoginOnly(email: string, password: string): Promise<{ professorName?: string }> {
        let sessionId: string | undefined;
        try {
            const session = await uatRestClient.createSession({ username: email, password });
            sessionId = session.sessionId;
            if (!session.authenticated || session.login?.exito === false) {
                throw new Error(session.login?.mensaje ?? 'Credenciales rechazadas por el portal UAT.');
            }
            return {
                professorName: session.login.parametros?.Txt_Usuario_AdmonUAT?.trim() || undefined,
            };
        } finally {
            if (sessionId) {
                await uatRestClient.deleteSession(sessionId).catch(() => undefined);
            }
        }
    }

    private async ensureDebugProfessorData(
        professorId: string,
        period: string,
    ): Promise<{ groupsCount: number; studentsCount: number }> {
        const professor = await prisma.professor.findUnique({ where: { id: professorId } });
        if (!professor) throw new Error('Profesor no encontrado para sembrar datos debug.');

        await prisma.professor.update({
            where: { id: professorId },
            data: { lastSyncPeriod: period },
        });

        const duration = Math.max(1, env.PRESENCIA_DEBUG_CLASS_HOURS || env.DEBUG_EXTRA_CLASS_HOURS);
        const scheduleValue = `08:00-${String(8 + duration).padStart(2, '0')}:00`;
        const schedule = {
            monday: scheduleValue,
            lunes: scheduleValue,
            tuesday: scheduleValue,
            martes: scheduleValue,
            wednesday: scheduleValue,
            miercoles: scheduleValue,
            thursday: scheduleValue,
            jueves: scheduleValue,
            friday: scheduleValue,
            viernes: scheduleValue,
        };

        const beaconUuid = '11111111-2222-4333-8444-555555555555';
        const classroom = 'DEBUG-101';
        const existingBeacon = await prisma.beacon.findUnique({
            where: { uuid: beaconUuid },
        });
        if (!existingBeacon) {
            await prisma.beacon.create({ data: { uuid: beaconUuid, classroom } });
        }

        let group = await prisma.group.findUnique({
            where: {
                code_groupLetter_professorId_period: {
                    code: '990001',
                    groupLetter: 'DBG',
                    professorId,
                    period,
                },
            },
        });

        if (!group) {
            group = await prisma.group.create({
                data: {
                    code: '990001',
                    groupLetter: 'DBG',
                    name: `DEBUG ASISTENCIA ${duration}H`,
                    level: 'DEBUG',
                    classroom,
                    schedule,
                    period,
                    professorId,
                },
            });
        }

        const students = [
            ['DBG0001', 'Alumno Debug Uno', '22222222-0001-4333-8444-555555555555'],
            ['DBG0002', 'Alumno Debug Dos', '22222222-0002-4333-8444-555555555555'],
            ['DBG0003', 'Alumno Debug Tres', '22222222-0003-4333-8444-555555555555'],
            ['DBG0004', 'Alumno Debug Cuatro', '22222222-0004-4333-8444-555555555555'],
            ['DBG0005', 'Alumno Debug Cinco', '22222222-0005-4333-8444-555555555555'],
            ['DBG0006', 'Alumno Debug Seis', '22222222-0006-4333-8444-555555555555'],
        ] as const;

        for (const [matricula, name, attendanceUuid] of students) {
            await prisma.student.upsert({
                where: {
                    matricula_groupId: {
                        matricula,
                        groupId: group.id,
                    },
                },
                create: {
                    matricula,
                    name,
                    beaconUuid: attendanceUuid,
                    groupId: group.id,
                },
                update: {
                    name,
                    beaconUuid: attendanceUuid,
                },
            });

            await studentDeviceBinding.upsert({
                where: { matricula },
                create: {
                    matricula,
                    attendanceUuid,
                    deviceBindingId: `debug-${matricula.toLowerCase()}`,
                    platform: 'debug',
                    deviceInfo: 'Dispositivo de prueba generado por PRESENCIA_DEBUG_MODE',
                },
                update: {
                    attendanceUuid,
                    deviceBindingId: `debug-${matricula.toLowerCase()}`,
                    platform: 'debug',
                    deviceInfo: 'Dispositivo de prueba generado por PRESENCIA_DEBUG_MODE',
                },
            });
        }

        await prisma.syncJob.create({
            data: {
                professorId,
                status: 'COMPLETED',
                totalGroups: await prisma.group.count({ where: { professorId, period } }),
                currentGroup: 1,
                currentGroupName: `Modo debug: materias listas para ${professor.institutionalEmail}`,
                completedAt: new Date(),
            },
        });

        const [groupsCount, studentsCount] = await Promise.all([
            prisma.group.count({ where: { professorId, period } }),
            prisma.student.count({ where: { group: { professorId, period } } }),
        ]);

        return { groupsCount, studentsCount };
    }
}

export const authService = new AuthService();
