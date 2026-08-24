import { describe, expect, it, vi } from 'vitest';
import { ProjectionReconciler } from './projection-reconciler.js';
import type { ProjectionEvent } from '../domain/projection-event.js';

describe('ProjectionReconciler', () => {
  it('rebuilds academic and attendance projections with stable events', async () => {
    const projected: ProjectionEvent[] = [];
    const project = vi.fn(async (event: ProjectionEvent, _consumer: string) => { projected.push(event); return true; });
    const sources = {
      academic: async () => [{
        externalGroupId: '947699', active: true, observedAt: '2026-08-02T12:00:00.000Z', rosterVersion: 'snapshot-1',
        teacher: { externalId: '308127', institutionalCode: '308127', name: 'Profesor', email: null, lastAuthenticatedAt: '2026-08-02T11:00:00.000Z' },
        cycle: { externalId: '151', name: '2026 - 2' },
        group: { externalGroupId: '947699', code: '947699', groupLetter: 'A', name: 'Calculo', level: null, classroom: null, period: '1', schedule: {} },
        subject: { externalId: '12:MAT', code: 'MAT', name: 'Calculo' },
        coordination: { externalId: '12', name: 'FIUAT', shortName: null },
      }],
      attendance: async () => [{
        attendanceSessionId: 'session-1', externalGroupId: '947699', professorExternalId: '308127',
        date: '2026-08-02', professorEntryAt: null, professorExitAt: null, actualClassroom: null, entriesCount: 22,
        uploadStatus: 'COMPLETED' as const, uploadError: null, version: 1, observedAt: '2026-08-02T13:00:00.000Z',
      }],
    };
    const reconciler = new ProjectionReconciler({ project } as never, sources, 300_000, { info: vi.fn(), error: vi.fn() });
    const result = await reconciler.reconcile();
    expect(result).toEqual({ academic: 1, attendance: 1 });
    expect(reconciler.isReady()).toBe(true);
    expect(projected.map((event) => event.eventType)).toEqual([
      'academic.roster_updated.v1', 'attendance.corrected.v1',
    ]);
    expect(projected[1]?.payload).toMatchObject({ entriesCount: 22, uploadStatus: 'COMPLETED' });
  });

  it('projects inactive academic groups as deactivations', async () => {
    const projected: ProjectionEvent[] = [];
    const project = vi.fn(async (event: ProjectionEvent, _consumer: string) => { projected.push(event); return true; });
    const academic = {
      externalGroupId: '947699', active: false, observedAt: '2026-08-02T12:00:00.000Z', rosterVersion: 'snapshot-1',
      teacher: { externalId: '308127', institutionalCode: null, name: 'Profesor', email: null, lastAuthenticatedAt: '2026-08-02T11:00:00.000Z' },
      cycle: { externalId: '151', name: '2026 - 2' },
      group: { externalGroupId: '947699', code: '947699', groupLetter: 'A', name: 'Calculo', level: null, classroom: null, period: '1', schedule: {} },
      subject: { externalId: '12:MAT', code: null, name: 'Calculo' },
      coordination: { externalId: '12', name: 'FIUAT', shortName: null },
    };
    const reconciler = new ProjectionReconciler(
      { project } as never, { academic: async () => [academic], attendance: async () => [] }, 300_000,
      { info: vi.fn(), error: vi.fn() },
    );
    await reconciler.reconcile();
    expect(projected[0]).toMatchObject({
      eventType: 'academic.group_deactivated.v1', payload: { externalGroupId: '947699' },
    });
  });
});
