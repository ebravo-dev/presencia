import { describe, expect, it } from 'vitest';
import { DemoCatalogService } from './catalog.service.js';
import { demoPortalEnvSchema } from './config.js';
import { MemoryDemoPortalRepository } from './repository.js';

const env = demoPortalEnvSchema.parse({
  NODE_ENV: 'test', PRESENCIA_DEBUG_MODE: true, PRESENCIA_DEMO_SEED: false,
  INTERNAL_API_TOKEN: 'i'.repeat(32), DEMO_SESSION_SECRET: 's'.repeat(32),
  PRESENCIA_DEMO_DEFAULT_PASSWORD: 'demo-password',
});

describe('DemoCatalogService', () => {
  it('manages teachers, students and their class without exposing password hashes', async () => {
    const service = new DemoCatalogService(new MemoryDemoPortalRepository(), env);
    await service.initialize();
    const teacher = await service.createTeacher({ email: 'teacher.demo@uat.edu.mx', name: 'Teacher Demo', password: 'teacher-password' });
    const student = await service.createStudent({
      matricula: 'demo-01', email: 'student.demo@alumnos.uat.edu.mx', name: 'Student Demo', password: 'student-password',
    });
    const item = await service.createClass({
      professorId: teacher.id, code: 'DEMO-101', groupLetter: 'A', name: 'Demo class', classroom: 'D-101',
      period: '2026-3', beaconUuid: '11111111-2222-4333-8444-555555555555',
      schedule: { monday: [{ startTime: '08:00', endTime: '10:00' }] }, studentIds: [student.id],
    });
    expect(item.professor?.email).toBe('teacher.demo@uat.edu.mx');
    expect(item.students).toHaveLength(1);
    expect(await service.authenticateTeacher('teacher.demo@uat.edu.mx', 'teacher-password')).toMatchObject({ id: teacher.id });
    expect(await service.authenticateStudent('DEMO-01', 'student-password')).toMatchObject({ id: student.id });
    const simulated = await service.simulateAttendance(item.id, {
      date: '2026-08-03', entries: [{ studentId: student.id, status: 'LATE' }],
    });
    expect(simulated).toMatchObject({
      groupId: item.groupId,
      weekStart: '2026-08-03',
      attendances: [{ id_alumno: student.uatStudentId, status: 'LATE', sn_asistencia: true }],
    });
    await expect(service.createClass({
      professorId: teacher.id, code: 'DEMO-102', groupLetter: 'B', name: 'Conflicting demo class', classroom: 'D-101',
      period: '2026-3', beaconUuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', schedule: {}, studentIds: [],
    })).rejects.toMatchObject({ code: 'DEMO_BEACON_ASSIGNMENT_CONFLICT' });
    expect(JSON.stringify(await service.snapshot())).not.toContain('passwordHash');
  });
});
