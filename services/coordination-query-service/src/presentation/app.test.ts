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
});

async function testApp() {
  return buildCoordinationQueryApp({
    env: coordinationQueryEnvSchema.parse({ NODE_ENV: 'test', INTERNAL_API_TOKEN: token }),
    repository: {
      overview: async () => ({ data: { counts: { teachers: 1, subjects: 2, coordinations: 1, assignments: 2 }, coordinations: [] }, meta: {} }),
      coordinations: async () => ({ data: [], meta: {} }), teachers: async () => ({ data: [], meta: {} }),
      teacherAssignments: async () => null, teacherReportSource: async () => null, project: async () => true,
    },
    reports: { weekly: async () => null, range: async () => null } as never,
    ready: async () => true,
  });
}
