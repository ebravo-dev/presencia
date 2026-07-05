import { describe, expect, it } from 'vitest';
import type { IGroupAssignmentRepository } from '../../domain/repositories/group-assignment.repository.js';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.js';
import {
  AttendanceBackendUnavailableError,
  type AttendanceBackendClient,
} from '../../infrastructure/http/client/attendance-backend.client.js';
import { WeeklyAttendanceReportService } from './weekly-attendance-report.service.js';

const teacher = {
  id: 'teacher-1', externalId: '308127', institutionalCode: 'P1', name: 'Ada Lovelace', email: 'ada@uat.edu.mx',
  lastAuthenticatedAt: new Date(), lastHarvestedAt: new Date(), assignmentCount: 1, subjectCount: 1, coordinations: [],
};
const teacherRepository = { findById: async () => teacher } as unknown as ITeacherRepository;

describe('WeeklyAttendanceReportService', () => {
  it('considera tomada la captura local aunque el portal haya fallado', async () => {
    const source = { getWeeklyAttendance: async () => ({
      id: 'p1', institutionalEmail: teacher.email, name: teacher.name,
      groups: [{ id: 'g1', code: 'MAT-1', groupLetter: 'A', name: 'Calculo', level: 'Licenciatura', classroom: 'A1', period: '2020-1', schedule: { lunes: '07:00 - 08:00', martes: '07:00 - 08:00' }, attendanceRecords: [{ date: '2020-01-06T00:00:00.000Z', portalSyncStatus: 'FAILED', portalSyncError: 'portal timeout', portalSyncedAt: null, createdAt: '2020-01-06T08:00:00.000Z' }] }],
    }) } as unknown as AttendanceBackendClient;
    const report = await new WeeklyAttendanceReportService(teacherRepository, source).getReport(teacher.id, '2020-01-06');
    expect(report.data.rows[0]?.cells.monday.status).toBe('TAKEN');
    expect(report.data.rows[0]?.cells.monday.portalSyncStatus).toBe('FAILED');
    expect(report.data.rows[0]?.cells.tuesday.status).toBe('MISSING');
    expect(report.data.rows[0]?.completionRate).toBe(50);
    expect(report.data.summary.completionRate).toBe(50);
  });

  it('consolida todos los horarios de una materia y grupo en una sola fila', async () => {
    const source = { getWeeklyAttendance: async () => ({
      id: 'p1', institutionalEmail: teacher.email, name: teacher.name,
      groups: [{
        id: 'g1', code: 'MAT-1', groupLetter: 'A', name: 'Calculo', level: 'Licenciatura', classroom: 'A1', period: '2020-1',
        schedule: {
          lunes: '07:00 - 08:00; 09:00 - 10:00',
          martes: '07:00 - 08:00',
          viernes: '-; -',
        },
        attendanceRecords: [],
      }],
    }) } as unknown as AttendanceBackendClient;

    const report = await new WeeklyAttendanceReportService(teacherRepository, source).getReport(teacher.id, '2020-01-06');

    expect(report.data.rows).toHaveLength(1);
    expect(report.data.rows[0]?.id).toBe('g1');
    expect(report.data.rows[0]?.rawSchedule).toBe('07:00-08:00 / 09:00-10:00');
    expect(report.data.rows[0]?.cells.monday.status).toBe('MISSING');
    expect(report.data.rows[0]?.cells.friday.status).toBe('NOT_SCHEDULED');
    expect(report.data.summary.scheduled).toBe(2);
  });

  it('devuelve disponibilidad explicita cuando el profesor no se ha sincronizado', async () => {
    const source = { getWeeklyAttendance: async () => null } as unknown as AttendanceBackendClient;
    const report = await new WeeklyAttendanceReportService(teacherRepository, source).getReport(teacher.id, '2020-01-06');
    expect(report.data.availability).toBe('NOT_SYNCED');
    expect(report.data.rows).toEqual([]);
  });

  it('usa horarios locales del ciclo correspondiente cuando el backend de asistencia no esta disponible', async () => {
    const source = {
      getWeeklyAttendance: async () => {
        throw new AttendanceBackendUnavailableError('No fue posible consultar el backend de asistencia.');
      },
    } as unknown as AttendanceBackendClient;
    const assignments = {
      findByTeacherId: async () => [
        assignmentDetail({ id: 'assignment-1', cycle: '2026 - 1 PRIMAVERA', subjectName: 'Calculo' }),
        assignmentDetail({ id: 'assignment-2', cycle: '2025-3', subjectName: 'Algebra' }),
      ],
      findById: async () => null,
      upsert: async () => undefined,
      count: async () => 2,
    } as IGroupAssignmentRepository;

    const report = await new WeeklyAttendanceReportService(teacherRepository, source, assignments).getReport(
      teacher.id,
      '2026-04-06',
    );

    expect(report.data.availability).toBe('ATTENDANCE_SOURCE_UNAVAILABLE');
    expect(report.data.rows).toHaveLength(1);
    expect(report.data.rows[0]?.subject).toBe('Calculo');
    expect(report.data.rows[0]?.cells.monday.status).toBe('SOURCE_UNAVAILABLE');
    expect(report.data.rows[0]?.completionRate).toBeNull();
    expect(report.data.summary.sourceUnavailable).toBe(1);
  });

  it('considera la segunda semana de agosto como tercer ciclo', async () => {
    const source = {
      getWeeklyAttendance: async () => {
        throw new AttendanceBackendUnavailableError('No fue posible consultar el backend de asistencia.');
      },
    } as unknown as AttendanceBackendClient;
    const assignments = {
      findByTeacherId: async () => [
        assignmentDetail({ id: 'assignment-1', cycle: '2026-2', subjectName: 'Calculo de verano' }),
        assignmentDetail({ id: 'assignment-2', cycle: '2026-3', subjectName: 'Calculo de otono' }),
      ],
      findById: async () => null,
      upsert: async () => undefined,
      count: async () => 2,
    } as IGroupAssignmentRepository;

    const report = await new WeeklyAttendanceReportService(teacherRepository, source, assignments).getReport(
      teacher.id,
      '2026-08-10',
    );

    expect(report.data.rows).toHaveLength(1);
    expect(report.data.rows[0]?.subject).toBe('Calculo de otono');
  });

  it('genera reporte de rango con dias programados, reportados y porcentaje por materia', async () => {
    const source = { getWeeklyAttendance: async () => ({
      id: 'p1',
      institutionalEmail: teacher.email,
      name: teacher.name,
      groups: [{
        id: 'g1',
        code: 'MAT-1',
        groupLetter: '2 T',
        name: 'Calculo',
        level: 'Licenciatura',
        classroom: 'A1',
        period: '2026-1',
        schedule: { lunes: '07:00 - 08:00', miercoles: '07:00 - 08:00', viernes: '07:00 - 08:00' },
        attendanceRecords: [
          { date: '2026-04-06T00:00:00.000Z', portalSyncStatus: 'COMPLETED', portalSyncError: null, portalSyncedAt: null, createdAt: '2026-04-06T08:00:00.000Z' },
          { date: '2026-04-08T00:00:00.000Z', portalSyncStatus: 'COMPLETED', portalSyncError: null, portalSyncedAt: null, createdAt: '2026-04-08T08:00:00.000Z' },
        ],
      }],
    }) } as unknown as AttendanceBackendClient;

    const report = await new WeeklyAttendanceReportService(teacherRepository, source).getRangeReport(
      teacher.id,
      '2026-04-06',
      '2026-04-12',
    );

    expect(report.data.rows).toHaveLength(1);
    expect(report.data.rows[0]).toMatchObject({
      subject: 'Calculo',
      grade: '2',
      groupCode: 'T',
      scheduledClassDays: 3,
      reportedClassDays: 2,
      attendanceRate: 66.67,
    });
    expect(report.data.summary).toMatchObject({
      scheduledClassDays: 3,
      reportedClassDays: 2,
      missingClassDays: 1,
      attendanceRate: 66.67,
    });
  });
});

function assignmentDetail(input: { id: string; cycle: string; subjectName: string }) {
  return {
    id: input.id,
    externalGroupId: input.id,
    groupCode: 'A',
    schoolCycleExternalId: input.cycle,
    schoolCycleName: input.cycle,
    classroom: 'A1',
    educationLevel: 'Licenciatura',
    period: input.cycle,
    schedule: {
      monday: [{ raw: '07:00-08:00', startTime: '07:00', endTime: '08:00' }],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    },
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    teacher: { id: teacher.id, externalId: teacher.externalId, name: teacher.name },
    subject: { id: `subject-${input.id}`, externalId: `12:${input.id}`, code: null, name: input.subjectName },
    coordination: { id: 'coordination-1', externalId: '12', name: 'FI' },
  };
}
