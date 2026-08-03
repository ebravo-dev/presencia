import { describe, expect, it } from 'vitest';
import { buildCoordinatorAuthHook, COORDINATOR_COOKIE } from './coordinator-auth.hook.js';

describe('buildCoordinatorAuthHook write authorization', () => {
  it('rejects a read-only coordinator before a protected command runs', async () => {
    const request = {
      cookies: { [COORDINATOR_COOKIE]: 'read-only-session' },
    };
    const reply = replyStub();
    const hook = buildCoordinatorAuthHook({
      authenticate: async () => ({
        id: 'reader-1', email: 'consulta@example.test', name: 'Consulta', role: 'READ_ONLY',
      }),
    } as never, { write: true });

    await hook(request as never, reply as never);

    expect(reply.statusCode).toBe(403);
    expect(reply.payload).toMatchObject({ error: 'COORDINATOR_FORBIDDEN' });
    expect(request).not.toHaveProperty('coordinator');
  });

  it('attaches an authorized coordinator to the request', async () => {
    const coordinator = {
      id: 'coord-1', email: 'coord@example.test', name: 'Coordinación', role: 'COORDINATOR',
    };
    const request = {
      cookies: { [COORDINATOR_COOKIE]: 'write-session' },
    };
    const reply = replyStub();
    const hook = buildCoordinatorAuthHook({
      authenticate: async () => coordinator,
    } as never, { write: true });

    await hook(request as never, reply as never);

    expect(reply.statusCode).toBe(200);
    expect(request).toHaveProperty('coordinator', coordinator);
  });
});

function replyStub() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    code(value: number) { this.statusCode = value; return this; },
    send(value?: unknown) { this.payload = value; return value; },
  };
}
