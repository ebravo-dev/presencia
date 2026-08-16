import { describe, expect, it } from 'vitest';
import { buildUatAttendancePayload } from './uat-attendance-matcher.js';

describe('buildUatAttendancePayload', () => {
    it('matches homonymous students using their saved UAT identity', () => {
        const payload = buildUatAttendancePayload({
            attendances: [
                { studentId: 'student-a', status: 'PRESENT' },
                { studentId: 'student-b', status: 'ABSENT' },
            ],
            students: [
                {
                    id: 'student-a',
                    matricula: '2200000001',
                    name: 'Álex García',
                    uatStudentId: 501,
                    listNumber: 4,
                },
                {
                    id: 'student-b',
                    matricula: '2200000002',
                    name: 'Alex Garcia',
                    uatStudentId: 902,
                    listNumber: 9,
                },
            ],
            portalStudents: [
                { Id_Alumno: 902, Num_Lista: 9, Txt_Alumno: 'Alex Garcia' },
                { Id_Alumno: 501, Num_Lista: 4, Txt_Alumno: 'ALEX GARCIA' },
            ],
            day: 3,
        });

        expect(payload).toEqual([
            { id_alumno: 501, num_pase_lista: 4, num_dia: 3, sn_asistencia: true },
            { id_alumno: 902, num_pase_lista: 9, num_dia: 3, sn_asistencia: false },
        ]);
    });

    it('uses matricula and verifies the normalized name when UAT identity has not been saved', () => {
        const payload = buildUatAttendancePayload({
            attendances: [{ studentId: 'student-a', status: 'LATE' }],
            students: [{ id: 'student-a', matricula: '2200000001', name: 'José López' }],
            portalStudents: [
                { Id_Alumno: 501, Num_Matricula: '2200000001', Num_Lista: 4, Txt_Alumno: 'JOSE LOPEZ' },
            ],
            day: 2,
        });

        expect(payload).toEqual([
            { id_alumno: 501, num_pase_lista: 4, num_dia: 2, sn_asistencia: true },
        ]);
    });

    it('allows a unique name match when UAT omits the matricula', () => {
        const payload = buildUatAttendancePayload({
            attendances: [{ studentId: 'student-a', status: 'PRESENT' }],
            students: [{ id: 'student-a', matricula: '2200000099', name: 'María Pérez' }],
            portalStudents: [
                { Id_Alumno: 501, Num_Lista: 4, Txt_Alumno: 'MARIA PEREZ' },
            ],
            day: 3,
        });

        expect(payload[0]?.id_alumno).toBe(501);
    });

    it('rejects an ambiguous name instead of marking the wrong homonym', () => {
        expect(() => buildUatAttendancePayload({
            attendances: [{ studentId: 'student-a', status: 'PRESENT' }],
            students: [{ id: 'student-a', matricula: '2200000099', name: 'Alex Garcia' }],
            portalStudents: [
                { Id_Alumno: 501, Num_Lista: 4, Txt_Alumno: 'Alex Garcia' },
                { Id_Alumno: 902, Num_Lista: 9, Txt_Alumno: 'Alex Garcia' },
            ],
            day: 3,
        })).toThrow('corresponde a varios alumnos');
    });

    it('rejects a saved UAT identity when its name does not match', () => {
        expect(() => buildUatAttendancePayload({
            attendances: [{ studentId: 'student-a', status: 'PRESENT' }],
            students: [{
                id: 'student-a',
                matricula: '2200000099',
                name: 'Alex Garcia',
                uatStudentId: 501,
            }],
            portalStudents: [
                { Id_Alumno: 501, Num_Lista: 4, Txt_Alumno: 'Roberto Perez' },
            ],
            day: 3,
        })).toThrow('no corresponde a Alex Garcia');
    });
});
