import { describe, expect, it } from 'vitest';
import { CoordinationController } from './coordination.controller.js';

describe('CoordinationController beacon cutover', () => {
  it('sends coordinator identity and request correlation to Attendance Service', async () => {
    let received: unknown;
    const controller = new CoordinationController(
      {} as never, {} as never, {} as never, {} as never,
      {
        createClassroomBeacon: async (input: unknown) => {
          received = input;
          return { data: { id: 'beacon-1' } };
        },
      } as never,
    );
    const reply = replyStub();
    await controller.createBeacon({
      id: 'request-1', coordinator: { id: 'coord-1', role: 'COORDINATOR' },
      body: { classroom: 'AULA 101', uuid: '12345678-1234-4234-9234-123456789abc' },
    } as never, reply as never);

    expect(received).toMatchObject({
      actorIdentityId: 'coord-1', actorRole: 'COORDINATOR', correlationId: 'request-1', classroom: 'AULA 101',
    });
    expect(reply.statusCode).toBe(201);
  });

  it('sends coordinator audit metadata when creating a shared class', async () => {
    let received: unknown;
    const controller = new CoordinationController(
      {} as never, {} as never, {} as never,
      {
        createSharedClass: async (input: unknown) => {
          received = input;
          return { data: { id: 'shared-1' } };
        },
      } as never,
    );
    const reply = replyStub();
    await controller.createSharedClass({
      id: 'request-2', coordinator: { id: 'coord-7', role: 'COORDINATOR' },
      body: {
        sourceAssignmentId: 'group-1', assignedTeacherId: 'teacher-2',
        schoolCycleYear: 2026, schoolCycleTerm: 2,
      },
    } as never, reply as never);

    expect(received).toMatchObject({
      sourceAssignmentId: 'group-1', assignedTeacherId: 'teacher-2',
      actorIdentityId: 'coord-7', actorRole: 'COORDINATOR', correlationId: 'request-2',
    });
    expect(reply.statusCode).toBe(201);
  });

  it('projects active shared classes into the dashboard instead of legacy substitutions', async () => {
    const controller = new CoordinationController(
      {} as never, {} as never,
      {} as never,
      {
        listSharedClasses: async () => ({
          data: [{
            id: 'shared-1', active: true, updatedAt: '2026-08-03T12:00:00.000Z',
            sourceAssignment: {
              groupCode: 'A', classroom: 'AULA 101', subject: { name: 'Arquitectura' },
              teacher: { name: 'Titular' },
            },
            assignedTeacher: { name: 'Sustituto' },
          }],
          meta: { generatedAt: '2026-08-03T12:00:00.000Z' },
        }),
      } as never,
      {
        infrastructureSummary: async () => ({
          data: {
            counts: { beacons: 3, studentDeviceBindings: 2, studentBleAttendances: 4 },
            recentBindings: [], recentBeacons: [],
          },
          meta: { generatedAt: '2026-08-03T12:00:00.000Z' },
        }),
      } as never,
    );

    const result = await controller.infrastructureSummary({} as never, replyStub() as never) as {
      data: { counts: { activeSubstitutions: number }; recentSubstitutions: Array<{ id: string }> };
    };
    expect(result.data.counts.activeSubstitutions).toBe(1);
    expect(result.data.recentSubstitutions).toEqual([expect.objectContaining({ id: 'shared-1' })]);
  });
});

function replyStub() {
  return {
    statusCode: 200,
    code(value: number) { this.statusCode = value; return this; },
    send(value?: unknown) { return value; },
  };
}
