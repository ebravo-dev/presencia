import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerUatIntegrationMetrics } from './http-metrics.js';

describe('UAT Integration HTTP metrics', () => {
  it('protects metrics and uses normalized Fastify routes as labels', async () => {
    const app = Fastify({ logger: false });
    const token = 'uat-metrics-token-with-at-least-32-characters';
    registerUatIntegrationMetrics(app, token);
    app.get('/probe/:id', async () => ({ ok: true }));

    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/probe/one' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/probe/two' })).statusCode).toBe(200);

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain(
      'presencia_uat_integration_http_requests_total{method="GET",route="/probe/:id",status_code="200"} 2',
    );
    expect(response.body).toContain('presencia_uat_integration_http_request_duration_seconds_bucket');

    await app.close();
  });
});
