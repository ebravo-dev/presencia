import { describe, expect, it } from 'vitest';
import type { CoordinationQueryRepository } from '../domain/query.repository.js';
import { CoordinationReportService } from './coordination-report.service.js';

describe('CoordinationReportService', () => {
  it('reflects professor entry and exit in the weekly coordinator dashboard', async () => {
    const service = new CoordinationReportService(repository(), () => new Date('2026-08-03T12:00:00.000Z'));
    const report = await service.weekly('teacher-1', '2026-07-27');

    expect(report?.data).toMatchObject({
      availability: 'READY',
      summary: { scheduled: 2, taken: 2, missing: 0, completionRate: 100 },
      rows: [{
        subject: 'Arquitectura',
        cells: { monday: { status: 'TAKEN', attendedHours: 2, portalSyncStatus: 'COMPLETED' } },
      }],
    });
  });

  it('aggregates the same projection over a custom date range', async () => {
    const service = new CoordinationReportService(repository(), () => new Date('2026-08-03T12:00:00.000Z'));
    const report = await service.range('teacher-1', '2026-07-27', '2026-07-31');
    expect(report?.data).toMatchObject({
      mode: 'range', summary: { scheduledClassDays: 2, reportedClassDays: 2, attendanceRate: 100 },
    });
  });
});

function repository(): CoordinationQueryRepository {
  return {
    async project() { return true; }, async overview() { return {}; }, async coordinations() { return {}; },
    async teachers() { return {}; }, async teacherAssignments() { return null; },
    async teacherReportSource() {
      return {
        teacher: { id: 'teacher-1', name: 'Profesor', email: 'profesor@uat.edu.mx', institutionalCode: '308127', coordinations: [] },
        groups: [{
          id: 'group-1', externalGroupId: '947699', groupCode: '1-A', schoolCycleExternalId: '151',
          schoolCycleName: '2026 - 2 VERANO', classroom: 'A1', educationLevel: 'LIC', period: '2026 - 2 VERANO',
          schedule: { monday: [{ raw: '08:00-10:00', startTime: '08:00', endTime: '10:00' }] },
          subject: { name: 'Arquitectura' },
          attendanceRecords: [{
            attendanceSessionId: 'attendance-1', date: new Date('2026-07-27T00:00:00.000Z'),
            professorEntryAt: new Date('2026-07-27T14:00:00.000Z'), professorExitAt: new Date('2026-07-27T16:00:00.000Z'),
            uploadStatus: 'COMPLETED', uploadError: null,
          }],
        }],
      };
    },
  };
}
