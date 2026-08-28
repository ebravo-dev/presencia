import type {
    UatAsistenciaAlumnoInput,
    UatAsistenciaAlumnoItem,
} from './uat-rest.client.js';

interface AttendanceValue {
    studentId: string;
    status: string;
}

interface StudentIdentity {
    id: string;
    matricula: string;
    name: string;
    uatStudentId?: number | null;
    listNumber?: number | null;
}

export function buildUatAttendancePayload(input: {
    attendances: readonly AttendanceValue[];
    students: readonly StudentIdentity[];
    portalStudents: readonly UatAsistenciaAlumnoItem[];
    day: number;
}): UatAsistenciaAlumnoInput[] {
    const studentsById = new Map(input.students.map((student) => [student.id, student]));
    const portalStudents = input.portalStudents.filter(hasUatStudentId);
    const portalStudentsById = new Map(portalStudents.map((student) => [student.Id_Alumno, student]));
    const portalStudentsByMatricula = groupBy(portalStudents, (student) => normalizeMatricula(student.Num_Matricula));
    const portalStudentsByName = groupBy(portalStudents, (student) => normalizeName(student.Txt_Alumno));
    const usedUatStudentIds = new Set<number>();
    const unmatchedIdentities: string[] = [];
    const payload: UatAsistenciaAlumnoInput[] = [];

    for (const attendance of input.attendances) {
        const student = studentsById.get(attendance.studentId);
        if (!student) {
            unmatchedIdentities.push(attendance.studentId);
            continue;
        }

        const portalStudent = resolvePortalStudent({
            student,
            portalStudentsById,
            portalStudentsByMatricula,
            portalStudentsByName,
            usedUatStudentIds,
        });
        if (!portalStudent) {
            unmatchedIdentities.push(identityLabel(student));
            continue;
        }

        assertSameIdentity(student, portalStudent);
        if (usedUatStudentIds.has(portalStudent.Id_Alumno)) {
            throw new Error(
                `El alumno UAT ${portalStudent.Id_Alumno} se intentó asignar a más de un registro local.`,
            );
        }
        usedUatStudentIds.add(portalStudent.Id_Alumno);

        payload.push({
            id_alumno: portalStudent.Id_Alumno,
            // UAT expects the pass/class number for this day, not Num_Lista.
            num_pase_lista: 1,
            num_dia: input.day,
            sn_asistencia: attendance.status === 'PRESENT' || attendance.status === 'LATE',
        });
    }

    if (unmatchedIdentities.length > 0) {
        const identities = [...new Set(unmatchedIdentities)].join(', ');
        throw new Error(`No se encontraron en UAT los alumnos: ${identities}.`);
    }

    if (payload.length === 0) {
        throw new Error('No se encontraron alumnos coincidentes por identidad en UAT.');
    }

    return payload;
}

function resolvePortalStudent(input: {
    student: StudentIdentity;
    portalStudentsById: ReadonlyMap<number, UatAsistenciaAlumnoItem & { Id_Alumno: number }>;
    portalStudentsByMatricula: ReadonlyMap<string, Array<UatAsistenciaAlumnoItem & { Id_Alumno: number }>>;
    portalStudentsByName: ReadonlyMap<string, Array<UatAsistenciaAlumnoItem & { Id_Alumno: number }>>;
    usedUatStudentIds: ReadonlySet<number>;
}): (UatAsistenciaAlumnoItem & { Id_Alumno: number }) | undefined {
    if (input.student.uatStudentId) {
        const byUatId = input.portalStudentsById.get(input.student.uatStudentId);
        if (byUatId && !input.usedUatStudentIds.has(byUatId.Id_Alumno)) return byUatId;
    }

    const matricula = normalizeMatricula(input.student.matricula);
    const byMatricula = availableCandidates(
        matricula ? input.portalStudentsByMatricula.get(matricula) : undefined,
        input.usedUatStudentIds,
    );
    const exactNameAndMatricula = byMatricula.filter(
        (candidate) => normalizeName(candidate.Txt_Alumno) === normalizeName(input.student.name),
    );
    if (exactNameAndMatricula.length === 1) return exactNameAndMatricula[0];
    if (byMatricula.length === 1) return byMatricula[0];
    if (byMatricula.length > 1) {
        throw new Error(`La matrícula ${input.student.matricula} aparece más de una vez en UAT.`);
    }

    const name = normalizeName(input.student.name);
    const byName = availableCandidates(
        name ? input.portalStudentsByName.get(name) : undefined,
        input.usedUatStudentIds,
    ).filter((candidate) => !normalizeMatricula(candidate.Num_Matricula));
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) {
        throw new Error(
            `El nombre "${input.student.name}" corresponde a varios alumnos en UAT; `
            + 'se necesita Id_Alumno o matrícula para distinguirlos.',
        );
    }

    return undefined;
}

function assertSameIdentity(
    student: StudentIdentity,
    portalStudent: UatAsistenciaAlumnoItem & { Id_Alumno: number },
): void {
    const localName = normalizeName(student.name);
    const portalName = normalizeName(portalStudent.Txt_Alumno);
    if (localName && portalName && localName !== portalName) {
        throw new Error(
            `La identidad UAT ${portalStudent.Id_Alumno} no corresponde a ${student.name} `
            + `(${student.matricula}); UAT reportó "${portalStudent.Txt_Alumno}".`,
        );
    }

    const localMatricula = normalizeMatricula(student.matricula);
    const portalMatricula = normalizeMatricula(portalStudent.Num_Matricula);
    if (localMatricula && portalMatricula && localMatricula !== portalMatricula) {
        throw new Error(
            `La identidad UAT ${portalStudent.Id_Alumno} de ${student.name} tiene una matrícula diferente `
            + `(${portalStudent.Num_Matricula} en UAT, ${student.matricula} local).`,
        );
    }
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const value of values) {
        const key = keyOf(value);
        if (!key) continue;
        const group = groups.get(key);
        if (group) group.push(value);
        else groups.set(key, [value]);
    }
    return groups;
}

function availableCandidates<T extends { Id_Alumno: number }>(
    candidates: readonly T[] | undefined,
    usedUatStudentIds: ReadonlySet<number>,
): T[] {
    return (candidates ?? []).filter((candidate) => !usedUatStudentIds.has(candidate.Id_Alumno));
}

function hasUatStudentId(
    student: UatAsistenciaAlumnoItem,
): student is UatAsistenciaAlumnoItem & { Id_Alumno: number } {
    return Number.isInteger(student.Id_Alumno) && Number(student.Id_Alumno) > 0;
}

function identityLabel(student: StudentIdentity): string {
    return `${student.name} (${student.matricula})`;
}

function normalizeMatricula(value: unknown): string {
    if (typeof value === 'number') return String(value).trim().toUpperCase();
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeName(value: unknown): string {
    return typeof value === 'string'
        ? value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase()
        : '';
}
