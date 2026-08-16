import { AttendanceStatus, PortalSyncStatus, SyncStatus } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { env } from '../../core/config/env.js';
import {
    uatRestClient,
    type UatAsistenciaAlumnoItem,
    type UatHorarioItem,
    type UatProfesorGrupoItem,
    type UatSemanaItem,
} from './uat-rest.client.js';
import { buildUatAttendancePayload } from './uat-attendance-matcher.js';

type AttendanceInput = Array<{ studentId: string; status: AttendanceStatus }>;

class UatRestSyncService {
    async syncProfessor(input: {
        professorId: string;
        email: string;
        password: string;
        currentPeriod?: string;
        cycleExternalId?: number;
    }): Promise<{ groupsCount: number; studentsCount: number }> {
        const configuredCycle = input.currentPeriod && input.cycleExternalId
            ? { name: input.currentPeriod, externalId: input.cycleExternalId }
            : (await uatRestClient.getActiveAcademicCycle()).data.active;
        const currentPeriod = configuredCycle.name;
        const cycleExternalId = configuredCycle.externalId;
        const syncJob = await prisma.syncJob.create({
            data: {
                professorId: input.professorId,
                status: SyncStatus.PENDING,
                currentGroup: 0,
                totalGroups: 5,
                currentGroupName: 'Preparando sincronización REST...',
            },
        });

        let sessionId: string | undefined;
        const updateStep = async (step: number, description: string) => {
            await prisma.syncJob.update({
                where: { id: syncJob.id },
                data: {
                    status: SyncStatus.IN_PROGRESS,
                    currentGroup: step,
                    totalGroups: 5,
                    currentGroupName: description,
                },
            });
        };

        try {
            await updateStep(1, 'Autenticando con backend-apirest...');
            const session = await uatRestClient.createSession({ username: input.email, password: input.password });
            sessionId = session.sessionId;

            const professorName = session.login.parametros?.Txt_Usuario_AdmonUAT?.trim();
            if (professorName) {
                await prisma.professor.update({
                    where: { id: input.professorId },
                    data: { name: professorName },
                });
            }

            const idPlantilla = Number(session.login.parametros?.Id_Plantilla_AdmonUAT);
            if (!Number.isFinite(idPlantilla) || idPlantilla <= 0) {
                throw new Error('backend-apirest no devolvió Id_Plantilla_AdmonUAT para sincronizar grupos.');
            }

            await updateStep(2, 'Obteniendo horarios y grupos desde backend-apirest...');
            const [horarios, controlGroups] = await Promise.all([
                uatRestClient.getHorarios(sessionId, {
                    Id_Ciclo_Escolar: cycleExternalId,
                    Id_DES: env.UAT_ID_DES,
                }),
                uatRestClient.getGruposProfesor(sessionId, {
                    Id_Des: env.UAT_ID_DES,
                    Id_Ciclo: cycleExternalId,
                    Id_Plantilla: idPlantilla,
                }),
            ]);

            const normalizedGroups = mergeUatGroups(horarios, controlGroups, currentPeriod);
            await updateStep(3, `${normalizedGroups.length} clases encontradas`);
            // Preserve existing groups and their attendance history if UAT sends
            // an empty or partial response. Stale-group deactivation will be a
            // separate, explicit reconciliation step once Group has an active flag.
            for (const group of normalizedGroups) {
                await prisma.group.upsert({
                    where: {
                        code_groupLetter_professorId_period: {
                            code: group.code,
                            groupLetter: group.groupLetter,
                            professorId: input.professorId,
                            period: currentPeriod,
                        },
                    },
                    create: {
                        code: group.code,
                        groupLetter: group.groupLetter,
                        name: group.name,
                        level: group.level,
                        classroom: group.classroom,
                        schedule: group.schedule,
                        period: currentPeriod,
                        professorId: input.professorId,
                    },
                    update: {
                        name: group.name,
                        level: group.level,
                        classroom: group.classroom,
                        schedule: group.schedule,
                    },
                });
            }

            await updateStep(4, 'Recolectando alumnos desde backend-apirest...');
            let studentsCount = 0;
            const errors: string[] = [];
            for (const [index, group] of normalizedGroups.entries()) {
                await prisma.syncJob.update({
                    where: { id: syncJob.id },
                    data: {
                        currentGroup: 4,
                        totalGroups: 5,
                        currentGroupName: `Obteniendo alumnos de ${group.name} (${index + 1}/${normalizedGroups.length})`,
                    },
                });

                try {
                    const students = await this.fetchStudentsForGroup(sessionId, group.idGrupo);
                    const dbGroup = await prisma.group.findFirst({
                        where: {
                            code: group.code,
                            groupLetter: group.groupLetter,
                            professorId: input.professorId,
                            period: currentPeriod,
                        },
                    });
                    if (!dbGroup) continue;

                    for (const student of students) {
                        const matricula = normalizeMatricula(student.Num_Matricula);
                        if (!matricula) continue;
                        const name = clean(student.Txt_Alumno) ?? `Alumno ${matricula}`;
                        const uatStudentId = positiveInteger(student.Id_Alumno);
                        const listNumber = positiveInteger(student.Num_Lista);
                        await prisma.student.upsert({
                            where: {
                                matricula_groupId: {
                                    matricula,
                                    groupId: dbGroup.id,
                                },
                            },
                            create: { matricula, name, uatStudentId, listNumber, groupId: dbGroup.id },
                            update: { name, uatStudentId, listNumber },
                        });
                        studentsCount++;
                    }
                } catch (error) {
                    errors.push(`${group.name}: ${error instanceof Error ? error.message : 'error desconocido'}`);
                }
            }

            const failed = normalizedGroups.length > 0 && studentsCount === 0;
            const partial = errors.length > 0;
            await prisma.syncJob.update({
                where: { id: syncJob.id },
                data: {
                    status: failed || partial ? SyncStatus.FAILED : SyncStatus.COMPLETED,
                    completedAt: new Date(),
                    currentGroup: 5,
                    totalGroups: 5,
                    currentGroupName: failed
                        ? 'No se pudieron obtener alumnos desde backend-apirest.'
                        : `¡Listo! ${normalizedGroups.length} materias y ${studentsCount} alumnos`,
                    error: failed || partial ? errors.join(' | ') || 'Sin alumnos encontrados' : null,
                },
            });

            return { groupsCount: normalizedGroups.length, studentsCount };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error sincronizando con backend-apirest';
            await prisma.syncJob.update({
                where: { id: syncJob.id },
                data: {
                    status: SyncStatus.FAILED,
                    completedAt: new Date(),
                    currentGroupName: message,
                    error: message,
                },
            });
            throw error;
        } finally {
            if (sessionId) await uatRestClient.deleteSession(sessionId).catch(() => undefined);
        }
    }

    async uploadAttendance(input: {
        professorId: string;
        email: string;
        password: string;
        attendanceRecordId: string;
        syncJobId: string;
        groupId: string;
        date: string;
        attendances: AttendanceInput;
    }): Promise<{ processedCount: number }> {
        let sessionId: string | undefined;
        try {
            await prisma.attendanceRecord.update({
                where: { id: input.attendanceRecordId },
                data: { portalSyncStatus: PortalSyncStatus.IN_PROGRESS, portalSyncError: null },
            });
            await prisma.syncJob.update({
                where: { id: input.syncJobId },
                data: {
                    status: SyncStatus.IN_PROGRESS,
                    currentGroup: 1,
                    totalGroups: input.attendances.length,
                    currentGroupName: 'Autenticando con backend-apirest...',
                },
            });

            const session = await uatRestClient.createSession({ username: input.email, password: input.password });
            sessionId = session.sessionId;
            const attendanceRecord = await prisma.attendanceRecord.findUnique({
                where: { id: input.attendanceRecordId },
                include: { group: true },
            });
            if (!attendanceRecord) throw new Error('Registro de asistencia no encontrado.');

            const idGrupo = Number(attendanceRecord.group.code);
            if (!Number.isFinite(idGrupo) || idGrupo <= 0) {
                throw new Error(`El grupo ${attendanceRecord.group.name} no tiene Id_Grupo UAT válido.`);
            }

            const range = await this.resolveWeekRange(sessionId, idGrupo, input.date);
            const portalStudents = await uatRestClient.getAsistenciaGrupo(sessionId, {
                Id_Grupo: idGrupo,
                fec_ini: range.start,
                fec_fin: range.end,
            });
            const portalList = normalizePortalStudents(portalStudents);
            const dbStudents = await prisma.student.findMany({
                where: { id: { in: input.attendances.map((item) => item.studentId) }, groupId: input.groupId },
                select: {
                    id: true,
                    matricula: true,
                    name: true,
                    uatStudentId: true,
                    listNumber: true,
                },
            });
            const dia = dayNumber(input.date);
            const payload = buildUatAttendancePayload({
                attendances: input.attendances,
                students: dbStudents,
                portalStudents: portalList,
                day: dia,
            });

            await prisma.syncJob.update({
                where: { id: input.syncJobId },
                data: {
                    currentGroup: payload.length,
                    totalGroups: payload.length,
                    currentGroupName: 'Enviando asistencia a backend-apirest...',
                },
            });
            await uatRestClient.guardarAsistencias(sessionId, {
                Id_Grupo: idGrupo,
                Fec_Ini: range.start,
                Asistencia: payload,
            });

            await prisma.attendanceRecord.update({
                where: { id: input.attendanceRecordId },
                data: {
                    portalSyncStatus: PortalSyncStatus.COMPLETED,
                    portalSyncError: null,
                    portalSyncedAt: new Date(),
                },
            });
            await prisma.syncJob.update({
                where: { id: input.syncJobId },
                data: {
                    status: SyncStatus.COMPLETED,
                    completedAt: new Date(),
                    currentGroupName: 'Asistencia enviada a backend-apirest',
                    error: null,
                },
            });
            return { processedCount: payload.length };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error subiendo asistencia por backend-apirest';
            await prisma.attendanceRecord.update({
                where: { id: input.attendanceRecordId },
                data: { portalSyncStatus: PortalSyncStatus.FAILED, portalSyncError: message },
            });
            await prisma.syncJob.update({
                where: { id: input.syncJobId },
                data: {
                    status: SyncStatus.FAILED,
                    completedAt: new Date(),
                    currentGroupName: message,
                    error: message,
                },
            });
            throw error;
        } finally {
            if (sessionId) await uatRestClient.deleteSession(sessionId).catch(() => undefined);
        }
    }

    private async fetchStudentsForGroup(sessionId: string, idGrupo: number) {
        const range = await this.resolveWeekRange(sessionId, idGrupo);
        const response = await uatRestClient.getAsistenciaGrupo(sessionId, {
            Id_Grupo: idGrupo,
            fec_ini: range.start,
            fec_fin: range.end,
        });
        return normalizePortalStudents(response);
    }

    private async resolveWeekRange(sessionId: string, idGrupo: number, targetDate?: string) {
        const semanas = await uatRestClient.getSemanasGrupo(sessionId, { Id_Grupo: idGrupo });
        const normalized = semanas
            .map(normalizeWeek)
            .filter((item): item is { start: string; end: string } => Boolean(item));
        if (normalized.length === 0) {
            const fallback = targetDate ? new Date(`${targetDate}T12:00:00.000Z`) : new Date();
            return weekRangeFor(fallback);
        }
        if (!targetDate) return normalized[0];

        const target = parseIsoDate(targetDate).getTime();
        return normalized.find((week) => {
            const start = parseUatDate(week.start).getTime();
            const end = parseUatDate(week.end).getTime();
            return target >= start && target <= end;
        }) ?? normalized[0];
    }
}

function mergeUatGroups(horarios: UatHorarioItem[], controlGroups: UatProfesorGrupoItem[], currentPeriod: string) {
    const byId = new Map<number, { horario?: UatHorarioItem; control?: UatProfesorGrupoItem }>();
    for (const horario of horarios) byId.set(horario.Id_Grupo, { ...byId.get(horario.Id_Grupo), horario });
    for (const control of controlGroups) byId.set(control.Id_Grupo, { ...byId.get(control.Id_Grupo), control });

    return [...byId.entries()].map(([idGrupo, value]) => {
        const horario = value.horario;
        const control = value.control;
        const groupLetter = clean(horario?.Txt_Letra ?? control?.Txt_Letra ?? control?.Grupo) ?? '';
        return {
            idGrupo,
            code: String(idGrupo),
            groupLetter,
            period: currentPeriod,
            name: clean(horario?.Txt_Materia ?? control?.Txt_Materia ?? control?.Materia) ?? `Grupo ${idGrupo}`,
            level: clean(horario?.Txt_DES ?? horario?.Txt_Nombre_Corto) ?? 'UAT',
            classroom: clean(horario?.Txt_Espacio_Fisico) ?? '',
            schedule: {
                lunes: clean(horario?.Txt_Lunes) ?? '',
                martes: clean(horario?.Txt_Martes) ?? '',
                miercoles: clean(horario?.Txt_Miercoles) ?? '',
                jueves: clean(horario?.Txt_Jueves) ?? '',
                viernes: clean(horario?.Txt_Viernes) ?? '',
                sabado: clean(horario?.Txt_Sabado) ?? '',
                domingo: clean(horario?.Txt_Domingo) ?? '',
            },
        };
    });
}

function normalizePortalStudents(response: unknown): UatAsistenciaAlumnoItem[] {
    const record = typeof response === 'object' && response !== null ? response as Record<string, unknown> : {};
    const raw = record.alumnos ?? record.Alumnos ?? record.data ?? [];
    return Array.isArray(raw)
        ? raw
            .map((item) => typeof item === 'object' && item !== null ? item as UatAsistenciaAlumnoItem : null)
            .filter((item): item is UatAsistenciaAlumnoItem => Boolean(item?.Id_Alumno))
        : [];
}

function normalizeWeek(item: UatSemanaItem) {
    const start = clean(item.Fec_Ini ?? item.fec_ini);
    const end = clean(item.Fec_Fin ?? item.fec_fin);
    return start && end ? { start, end } : null;
}

function weekRangeFor(date: Date) {
    const day = date.getUTCDay() || 7;
    const start = new Date(date);
    start.setUTCDate(date.getUTCDate() - day + 1);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { start: formatUatDate(start), end: formatUatDate(end) };
}

function parseIsoDate(value: string) {
    return new Date(`${value}T12:00:00.000Z`);
}

function parseUatDate(value: string) {
    const [day, month, year] = value.split('/').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatUatDate(value: Date) {
    return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`;
}

function dayNumber(date: string) {
    return parseIsoDate(date).getUTCDay() || 7;
}

function clean(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeMatricula(value: unknown) {
    const raw = typeof value === 'number' ? String(value) : clean(value) ?? '';
    return raw.toUpperCase();
}

function positiveInteger(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export const uatRestSyncService = new UatRestSyncService();
