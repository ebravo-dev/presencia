import 'dotenv/config';
import { UatClientFactory } from '../infrastructure/http/client/uat-client.factory.js';
import { UatStudentClientFactory } from '../infrastructure/http/client/uat-student-client.factory.js';
import type {
  JsonRecord,
  UatCicloEscolarItem,
  UatDesItem,
  UatNivelEducativoItem,
} from '../domain/types/uat.interfaces.js';

interface PortalSmokeResult {
  authenticated: true;
  authCookie: boolean;
  sessionCookie: boolean;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

function readPositiveInteger(record: JsonRecord | undefined, keys: string[]): number | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN;
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function readNonEmptyString(record: JsonRecord | undefined, keys: string[]): string | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }

  return null;
}

function isActiveCycle(cycle: UatCicloEscolarItem): boolean {
  const value = cycle.Sn_Activo;
  if (value === true || value === 1) return true;
  return typeof value === 'string' && ['1', 'true', 'si', 'sí', 'activo'].includes(value.trim().toLowerCase());
}

async function smokeStudent(): Promise<PortalSmokeResult & {
  careers: number;
  scheduleItems: number;
  partialGradeItems: number;
  finalGradeItems: number;
}> {
  const client = new UatStudentClientFactory().create();
  await client.authenticate({
    username: requiredEnv('UAT_STUDENT_USER').trim(),
    password: requiredEnv('UAT_STUDENT_PASS'),
  });
  const careers = await client.getCareers();
  const selectedPlan = readPositiveInteger(careers[0], ['Id_Plan_Estudio']);
  if (!selectedPlan) throw new Error('El portal de alumnos no devolvio una carrera seleccionable.');

  // La selección sólo cambia el contexto de la sesión remota; no modifica datos académicos.
  await client.selectCareer(selectedPlan);
  const [schedule, partialGrades, finalGrades] = await Promise.all([
    client.getSchedule(),
    client.getPartialGrades(),
    client.getFinalGrades(),
  ]);
  const cookies = client.getCookieDiagnostics();

  return {
    authenticated: true,
    authCookie: cookies.hasAuthCookie,
    sessionCookie: cookies.hasSessionCookie,
    careers: careers.length,
    scheduleItems: schedule.length,
    partialGradeItems: partialGrades.length,
    finalGradeItems: finalGrades.length,
  };
}

async function discoverTeacherContexts(client: ReturnType<UatClientFactory['create']>): Promise<{
  levels: UatNivelEducativoItem[];
  campuses: number;
  coordinations: UatDesItem[];
}> {
  const levels = await client.getNivelesEducativos();
  const coordinationById = new Map<number, UatDesItem>();
  let campusCount = 0;

  for (const level of levels) {
    const campuses = await client.getCampus(level.Id_Nivel_Educativo);
    campusCount += campuses.length;
    for (const campus of campuses) {
      const coordinations = await client.getDes(level.Id_Nivel_Educativo, campus.Id_CU);
      for (const coordination of coordinations) {
        const id = readPositiveInteger(coordination, ['Id_DES', 'Id_Des', 'id_des', 'idDes']);
        if (id) coordinationById.set(id, { ...coordination, Id_DES: id });
      }
    }
  }

  return { levels, campuses: campusCount, coordinations: [...coordinationById.values()] };
}

async function smokeTeacher(): Promise<PortalSmokeResult & {
  levels: number;
  campuses: number;
  coordinations: number;
  cycles: number;
  queriedCycles: number;
  groups: number;
  schedules: number;
  exams: number;
  attendanceGroupResolved: boolean;
  attendanceProbe: 'passed' | 'unavailable';
  attendanceWeeks: number;
  rosterItems: number;
}> {
  const client = new UatClientFactory().create();
  const login = await client.authenticate({
    username: requiredEnv('UAT_TEACHER_USER').trim(),
    password: requiredEnv('UAT_TEACHER_PASS'),
  });
  const plantillaId = readPositiveInteger(login.parametros, ['Id_Plantilla_AdmonUAT']);
  if (!plantillaId) throw new Error('El portal de profesores no devolvio Id_Plantilla_AdmonUAT.');

  const [contexts, cycles] = await Promise.all([
    discoverTeacherContexts(client),
    client.getCiclosEscolares(),
  ]);
  const activeCycles = cycles.filter(isActiveCycle);
  const queriedCycles = activeCycles.length > 0 ? activeCycles : cycles.slice(0, 1);
  let groups = 0;
  let schedules = 0;
  let exams = 0;
  let attendanceGroupId: number | null = null;

  for (const coordination of contexts.coordinations) {
    for (const cycle of queriedCycles) {
      const [groupItems, scheduleItems, examItems] = await Promise.all([
        client.getGruposProfesor({
          Id_Des: coordination.Id_DES,
          Id_Ciclo: cycle.Id_Ciclo_Escolar,
          Id_Plantilla: plantillaId,
        }),
        client.getHorarios({ Id_DES: coordination.Id_DES, Id_Ciclo_Escolar: cycle.Id_Ciclo_Escolar }),
        client.getExamenes({ Id_DES: coordination.Id_DES, Id_Ciclo_Escolar: cycle.Id_Ciclo_Escolar }),
      ]);
      groups += groupItems.length;
      schedules += scheduleItems.length;
      exams += examItems.length;
      attendanceGroupId ??= readPositiveInteger(groupItems[0], ['Id_Grupo', 'id_grupo'])
        ?? readPositiveInteger(scheduleItems[0], ['Id_Grupo', 'id_grupo']);
    }
  }
  let attendanceWeeks = 0;
  let rosterItems = 0;
  let attendanceProbe: 'passed' | 'unavailable' = attendanceGroupId ? 'passed' : 'unavailable';
  if (attendanceGroupId) {
    try {
      const weeks = await client.getSemanasGrupo({ Id_Grupo: attendanceGroupId });
      attendanceWeeks = weeks.length;
      const readableWeek = weeks.find((week) =>
        readNonEmptyString(week, ['Fec_Ini', 'fec_ini']) && readNonEmptyString(week, ['Fec_Fin', 'fec_fin']));
      const start = readNonEmptyString(readableWeek, ['Fec_Ini', 'fec_ini']);
      const end = readNonEmptyString(readableWeek, ['Fec_Fin', 'fec_fin']);
      if (!start || !end) {
        attendanceProbe = 'unavailable';
      } else {
        const attendance = await client.getAsistenciaGrupo({
          Id_Grupo: attendanceGroupId,
          fec_ini: start,
          fec_fin: end,
        });
        const roster = attendance.alumnos ?? attendance.Alumnos ?? attendance.data;
        rosterItems = Array.isArray(roster) ? roster.length : 0;
      }
    } catch {
      attendanceProbe = 'unavailable';
    }
  }
  const cookies = client.getCookieDiagnostics();

  return {
    authenticated: true,
    authCookie: cookies.hasAuthCookie,
    sessionCookie: cookies.hasSessionCookie,
    levels: contexts.levels.length,
    campuses: contexts.campuses,
    coordinations: contexts.coordinations.length,
    cycles: cycles.length,
    queriedCycles: queriedCycles.length,
    groups,
    schedules,
    exams,
    attendanceGroupResolved: attendanceGroupId !== null,
    attendanceProbe,
    attendanceWeeks,
    rosterItems,
  };
}

async function main(): Promise<void> {
  const [student, teacher] = await Promise.all([smokeStudent(), smokeTeacher()]);
  console.log(JSON.stringify({
    ok: true,
    mode: 'read-only',
    student,
    teacher,
    checkedAt: new Date().toISOString(),
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Fallo desconocido en el smoke UAT de solo lectura.');
  process.exitCode = 1;
});
