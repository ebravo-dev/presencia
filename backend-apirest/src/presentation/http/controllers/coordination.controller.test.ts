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
});

function replyStub() {
  return {
    statusCode: 200,
    code(value: number) { this.statusCode = value; return this; },
    send(value?: unknown) { return value; },
  };
}
