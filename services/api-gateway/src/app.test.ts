import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type GatewayEnv, gatewayEnvSchema } from './config.js';
import { buildGateway } from './app.js';

const metricsToken = 'a-different-metrics-token-with-at-least-32-characters';

describe('API Gateway', () => {
  let legacy: FastifyInstance;
  let uat: FastifyInstance;
  let gateway: FastifyInstance;
  let env: GatewayEnv;

  beforeEach(async () => {
    legacy = Fastify();
    legacy.all('/*', async (request) => ({
      upstream: 'legacy',
      correlationId: request.headers['x-correlation-id'],
      internalToken: request.headers['x-internal-service-token'],
      traceparent: request.headers.traceparent,
    }));
    await legacy.listen({ host: '127.0.0.1', port: 0 });

    uat = Fastify();
    uat.all('/*', async (request) => ({
      upstream: 'uat',
      correlationId: request.headers['x-correlation-id'],
      internalToken: request.headers['x-internal-service-token'],
      traceparent: request.headers.traceparent,
    }));
    await uat.listen({ host: '127.0.0.1', port: 0 });

    env = gatewayEnvSchema.parse({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      LEGACY_BACKEND_URL: legacy.listeningOrigin,
      UAT_INTEGRATION_URL: uat.listeningOrigin,
      METRICS_TOKEN: metricsToken,
    });
    gateway = await buildGateway({
      env,
      redis: { ping: async () => 'PONG', quit: async () => 'OK' },
    });
  });

  afterEach(async () => {
    await Promise.all([gateway?.close(), legacy?.close(), uat?.close()]);
  });

  it('routes UAT requests and strips untrusted internal headers', async () => {
    const response = await gateway.inject({
      method: 'GET',
      url: '/api/uat/alumnos/horario',
      headers: {
        'x-correlation-id': 'mobile-request-123',
        'x-internal-service-token': 'attacker-value',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      upstream: 'uat',
      correlationId: 'mobile-request-123',
    });
    expect(response.json().internalToken).toBeUndefined();
    expect(response.headers['x-correlation-id']).toBe('mobile-request-123');
    expect(response.headers.traceparent).toMatch(/^00-[\da-f]{32}-[\da-f]{16}-01$/);
    expect(response.json().traceparent).toBe(response.headers.traceparent);
  });

  it('fails closed when a cutover target has no configured upstream', async () => {
    const cutoverGateway = await buildGateway({
      env: gatewayEnvSchema.parse({
        ...env,
        ROUTE_TARGET_OVERRIDES: '{"/professors/login":"identity"}',
      }),
      redis: { ping: async () => 'PONG', quit: async () => 'OK' },
    });
    const response = await cutoverGateway.inject({ method: 'POST', url: '/professors/login', payload: {} });
    expect(response.statusCode).toBe(503);
    await cutoverGateway.close();
  });

  it('routes existing attendance endpoints without changing their path', async () => {
    const response = await gateway.inject({ method: 'POST', url: '/attendance/record', payload: {} });
    expect(response.statusCode).toBe(200);
    expect(response.json().upstream).toBe('legacy');
  });

  it('never exposes internal service routes', async () => {
    const response = await gateway.inject({ method: 'GET', url: '/internal/coordination/beacons' });
    expect(response.statusCode).toBe(404);
  });

  it('protects Prometheus metrics with a distinct token', async () => {
    expect((await gateway.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
    const response = await gateway.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${metricsToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('presencia_gateway_http_requests_total');
  });
});
