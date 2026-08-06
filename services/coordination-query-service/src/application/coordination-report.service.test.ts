import { describe, expect, it } from 'vitest';
import type { CoordinationQueryRepository } from '../domain/query.repository.js';
import { CoordinationReportService } from './coordination-report.service.js';

describe('CoordinationReportService', () => {
  it('reflects professor entry and exit in the weekly coordinator dashboard', async () => {
    const service = new CoordinationReportService(repository(), () => new Date('2026-08-03T12:00:00.000Z'));
    const report = await service.weekly('teacher-1', '2026-07-27');

    expect(report?.data).toMatchObject({
      availability: 'READY',
      summary: { scheduled: 4, taken: 4, missing: 0, completionRate: 100 },
      rows: [{
        subject: 'Arquitectura',
        startTime: '08:00', endTime: '12:00',
        cells: { monday: { status: 'TAKEN', scheduledHours: 4, attendedHours: 4, workedMinutes: 240, workedHours: 4, portalSyncStatus: 'COMPLETED' } },
      }],
    });
  });

  it('aggregates the same projection over a custom date range', async () => {
    const service = new CoordinationReportService(repository(), () => new Date('2026-08-03T12:00:00.000Z'));
    const report = await service.range('teacher-1', '2026-07-27', '2026-07-31');
    expect(report?.data).toMatchObject({
      mode: 'range', summary: { scheduledClassDays: 4, reportedClassDays: 4, attendanceRate: 100 },
    });
  });

  it('reads the coordinator tolerance for every generated report', async () => {
    const service = new CoordinationReportService(
      repository(),
      () => new Date('2026-08-03T12:00:00.000Z'),
      async () => 20,
    );

    const report = await service.weekly('teacher-1', '2026-07-27');

    expect(report?.meta.teacherAttendanceToleranceMinutes).toBe(20);
  });

  it('treats August as the third school cycle consistently with production selection', async () => {
    const service = new CoordinationReportService(
      repository({ externalId: '152', name: '2026 - 3 OTOÑO' }),
      () => new Date('2026-08-05T12:00:00.000Z'),
    );

    const report = await service.weekly('teacher-1', '2026-08-03');

    expect(report?.data.rows).toHaveLength(1);
  });
});

function repository(cycle = { externalId: '151', name: '2026 - 2 VERANO' }): CoordinationQueryRepository {
  return {
    async project() { return true; }, async overview() { return {}; }, async coordinations() { return {}; },
    async teachers() { return {}; }, async teacherAssignments() { return null; },
    async resetDemoData() {},
    async teacherReportSource() {
      return {
        teacher: { id: 'teacher-1', name: 'Profesor', email: 'profesor@uat.edu.mx', institutionalCode: '308127', coordinations: [] },
        groups: [{
          id: 'group-1', externalGroupId: '947699', groupCode: '1-A', schoolCycleExternalId: cycle.externalId,
          schoolCycleName: cycle.name, classroom: 'A1', educationLevel: 'LIC', period: cycle.name,
          schedule: { monday: [
            { raw: '08:00-09:00', startTime: '08:00', endTime: '09:00' },
            { raw: '09:00-10:00', startTime: '09:00', endTime: '10:00' },
            { raw: '10:00-11:00', startTime: '10:00', endTime: '11:00' },
            { raw: '11:00-12:00', startTime: '11:00', endTime: '12:00' },
          ] },
          subject: { name: 'Arquitectura' },
          attendanceRecords: [{
            attendanceSessionId: 'attendance-1', date: new Date('2026-07-27T00:00:00.000Z'),
            professorEntryAt: new Date('2026-07-27T14:00:00.000Z'), professorExitAt: new Date('2026-07-27T18:00:00.000Z'),
            uploadStatus: 'COMPLETED', uploadError: null,
          }],
        }],
      };
    },
  };
}
