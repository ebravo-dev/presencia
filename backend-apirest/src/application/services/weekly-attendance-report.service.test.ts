import { describe, expect, it } from 'vitest';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.js';
import type { AttendanceBackendClient } from '../../infrastructure/http/client/attendance-backend.client.js';
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
    expect(report.data.summary.completionRate).toBe(50);
  });

  it('devuelve disponibilidad explicita cuando el profesor no se ha sincronizado', async () => {
    const source = { getWeeklyAttendance: async () => null } as unknown as AttendanceBackendClient;
    const report = await new WeeklyAttendanceReportService(teacherRepository, source).getReport(teacher.id, '2020-01-06');
    expect(report.data.availability).toBe('NOT_SYNCED');
    expect(report.data.rows).toEqual([]);
  });
});
