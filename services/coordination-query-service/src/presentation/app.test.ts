import { describe, expect, it } from 'vitest';
import { coordinationQueryEnvSchema } from '../infrastructure/config.js';
import { buildCoordinationQueryApp } from './app.js';

const token = 'test-internal-service-token-with-at-least-32-characters';
describe('Coordination Query HTTP API', () => {
  it('does not expose the read model without service authentication', async () => {
    const app = await testApp();
    expect((await app.inject({ method: 'GET', url: '/internal/v1/coordination/overview' })).statusCode).toBe(404);
    await app.close();
  });

  it('preserves the dashboard overview contract', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'GET', url: '/internal/v1/coordination/overview', headers: { 'x-internal-service-token': token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { counts: { teachers: 1, assignments: 2 } } });
    await app.close();
  });

  it('allows projection cleanup only when demo mode is active', async () => {
    let resets = 0;
    const disabled = await testApp({ resetDemoData: async () => { resets += 1; } });
    expect((await disabled.inject({
      method: 'DELETE', url: '/internal/v1/coordination/demo-data', headers: { 'x-internal-service-token': token },
    })).statusCode).toBe(404);
    await disabled.close();

    const enabled = await testApp({ debugMode: true, resetDemoData: async () => { resets += 1; } });
    expect((await enabled.inject({
      method: 'DELETE', url: '/internal/v1/coordination/demo-data', headers: { 'x-internal-service-token': token },
    })).statusCode).toBe(204);
    expect(resets).toBe(1);
    await enabled.close();
  });

  it('allows an authenticated explicit purge outside demo mode', async () => {
    let resets = 0;
    const app = await testApp({ resetDemoData: async () => { resets += 1; } });
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/coordination/data/purge',
      headers: { 'x-internal-service-token': token }, payload: { confirmation: 'PURGE_ALL_DATA' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { purged: true, service: 'coordination-query' } });
    expect(resets).toBe(1);
    await app.close();
  });
});

async function testApp(options: { debugMode?: boolean; resetDemoData?: () => Promise<void> } = {}) {
  return buildCoordinationQueryApp({
    env: coordinationQueryEnvSchema.parse({
      NODE_ENV: 'test', INTERNAL_API_TOKEN: token, PRESENCIA_DEBUG_MODE: options.debugMode ?? false,
    }),
    repository: {
      overview: async () => ({ data: { counts: { teachers: 1, subjects: 2, coordinations: 1, assignments: 2 }, coordinations: [] }, meta: {} }),
      coordinations: async () => ({ data: [], meta: {} }), teachers: async () => ({ data: [], meta: {} }),
      teacherAssignments: async () => null, teacherReportSource: async () => null, project: async () => true,
      resetDemoData: options.resetDemoData ?? (async () => undefined),
    },
    reports: { weekly: async () => null, range: async () => null } as never,
    ready: async () => ({ database: true, rabbitmq: true, reconciliation: true }),
  });
}
