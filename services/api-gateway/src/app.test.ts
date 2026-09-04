import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type GatewayEnv, gatewayEnvSchema } from './config.js';
import { buildGateway } from './app.js';

const metricsToken = 'a-different-metrics-token-with-at-least-32-characters';

describe('API Gateway', () => {
  let uat: FastifyInstance;
  let attendance: FastifyInstance;
  let appLogs: FastifyInstance;
  let gateway: FastifyInstance;
  let env: GatewayEnv;

  beforeEach(async () => {
    uat = Fastify();
    uat.all('/*', async (request) => ({
      upstream: 'uat',
      correlationId: request.headers['x-correlation-id'],
      internalToken: request.headers['x-internal-service-token'],
      traceparent: request.headers.traceparent,
    }));
    await uat.listen({ host: '127.0.0.1', port: 0 });

    attendance = Fastify();
    attendance.all('/*', async (request) => ({
      upstream: 'attendance',
      authorization: request.headers.authorization,
      internalToken: request.headers['x-internal-service-token'],
    }));
    await attendance.listen({ host: '127.0.0.1', port: 0 });

    appLogs = Fastify();
    appLogs.all('/*', async (request) => ({
      upstream: 'app-logs',
      appLogKey: request.headers['x-app-log-key'],
      internalToken: request.headers['x-internal-service-token'],
    }));
    await appLogs.listen({ host: '127.0.0.1', port: 0 });

    env = gatewayEnvSchema.parse({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      UAT_INTEGRATION_URL: uat.listeningOrigin,
      ATTENDANCE_SERVICE_URL: attendance.listeningOrigin,
      APP_LOG_SERVICE_URL: appLogs.listeningOrigin,
      METRICS_TOKEN: metricsToken,
    });
    gateway = await buildGateway({
      env,
      redis: { ping: async () => 'PONG', quit: async () => 'OK' },
    });
  });

  afterEach(async () => {
    await Promise.all([gateway?.close(), uat?.close(), attendance?.close(), appLogs?.close()]);
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

  it('allows the coordinated demo reset to outlive the default upstream timeout', async () => {
    const slowUat = Fastify();
    slowUat.delete('/api/superUsuario/debug/data', async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { data: { reset: true } };
    });
    await slowUat.listen({ host: '127.0.0.1', port: 0 });
    const shortTimeoutGateway = await buildGateway({
      env: gatewayEnvSchema.parse({
        ...env,
        UAT_INTEGRATION_URL: slowUat.listeningOrigin,
        UPSTREAM_TIMEOUT_MS: 20,
      }),
      redis: { ping: async () => 'PONG', quit: async () => 'OK' },
    });

    const response = await shortTimeoutGateway.inject({
      method: 'DELETE',
      url: '/api/superUsuario/debug/data',
      payload: { confirmation: 'BORRAR DEMO' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { reset: true } });
    await shortTimeoutGateway.close();
    await slowUat.close();
  });

  it('allows the super-user database purge to outlive the default upstream timeout', async () => {
    const slowUat = Fastify();
    slowUat.post('/api/superUsuario/bases-datos/borrar', async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { data: { purged: ['academic'] } };
    });
    await slowUat.listen({ host: '127.0.0.1', port: 0 });
    const shortTimeoutGateway = await buildGateway({
      env: gatewayEnvSchema.parse({
        ...env,
        UAT_INTEGRATION_URL: slowUat.listeningOrigin,
        UPSTREAM_TIMEOUT_MS: 20,
      }),
      redis: { ping: async () => 'PONG', quit: async () => 'OK' },
    });

    const response = await shortTimeoutGateway.inject({
      method: 'POST',
      url: '/api/superUsuario/bases-datos/borrar',
      payload: { target: 'academic', confirmation: 'BORRAR ACADEMICA' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { purged: ['academic'] } });
    await shortTimeoutGateway.close();
    await slowUat.close();
  });

  it('fails closed when a cutover target has no configured upstream', async () => {
    const cutoverGateway = await buildGateway({
      env: gatewayEnvSchema.parse({
        ...env,
        ROUTE_TARGET_OVERRIDES: '{"/api/uat/profesor/sync":"identity"}',
      }),
      redis: { ping: async () => 'PONG', quit: async () => 'OK' },
    });
    const response = await cutoverGateway.inject({ method: 'POST', url: '/api/uat/profesor/sync', payload: {} });
    expect(response.statusCode).toBe(503);
    await cutoverGateway.close();
  });

  it('rejects retired attendance facade routes', async () => {
    const response = await gateway.inject({ method: 'POST', url: '/attendance/record', payload: {} });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('cuts student binding reconciliation over to Attendance without exposing service identity', async () => {
    const response = await gateway.inject({
      method: 'POST', url: '/api/student-device-bindings', payload: {},
      headers: { authorization: 'Bearer scoped-binding-token', 'x-internal-service-token': 'attacker-value' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ upstream: 'attendance', authorization: 'Bearer scoped-binding-token' });
    expect(response.json().internalToken).toBeUndefined();
  });

  it('routes mobile log batches without exposing service identity', async () => {
    const response = await gateway.inject({
      method: 'POST', url: '/api/app-logs/batches', payload: {},
      headers: { 'x-app-log-key': 'mobile-key', 'x-internal-service-token': 'attacker-value' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ upstream: 'app-logs', appLogKey: 'mobile-key' });
    expect(response.json().internalToken).toBeUndefined();
  });

  it('keeps mobile logs outside the shared gateway rate-limit budget', async () => {
    const priorityGateway = await buildGateway({
      env: gatewayEnvSchema.parse({ ...env, RATE_LIMIT_MAX: 1 }),
      redis: { ping: async () => 'PONG', quit: async () => 'OK' },
    });
    const logRequest = {
      method: 'POST' as const,
      url: '/api/app-logs/batches',
      payload: {},
      headers: { 'x-app-log-key': 'mobile-key' },
    };
    expect((await priorityGateway.inject(logRequest)).statusCode).toBe(200);
    expect((await priorityGateway.inject(logRequest)).statusCode).toBe(200);
    expect((await priorityGateway.inject({ method: 'GET', url: '/api/uat/one' })).statusCode).toBe(200);
    expect((await priorityGateway.inject({ method: 'GET', url: '/api/uat/two' })).statusCode).toBe(429);
    await priorityGateway.close();
  });

  it('enforces a dedicated log-ingestion budget', async () => {
    const limitedGateway = await buildGateway({
      env: gatewayEnvSchema.parse({ ...env, APP_LOG_INGESTION_RATE_LIMIT_MAX: 1 }),
      redis: { ping: async () => 'PONG', quit: async () => 'OK' },
    });
    const request = {
      method: 'POST' as const,
      url: '/api/app-logs/batches',
      payload: {},
      headers: { 'x-app-log-key': 'mobile-key' },
    };
    expect((await limitedGateway.inject(request)).statusCode).toBe(200);
    expect((await limitedGateway.inject(request)).statusCode).toBe(429);
    await limitedGateway.close();
  });

  it('never exposes internal service routes', async () => {
    const response = await gateway.inject({ method: 'GET', url: '/internal/coordination/beacons' });
    expect(response.statusCode).toBe(404);
  });

  it('rejects the retired beacon facade', async () => {
    const response = await gateway.inject({
      method: 'POST', url: '/api/beacons/resolve', payload: { classrooms: ['AULA 101'] },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
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

  it('uses dependency readiness and reports a degraded upstream', async () => {
    const identity = Fastify();
    identity.get('/health/ready', async (_request, reply) => reply.code(503).send({ status: 'degraded' }));
    await identity.listen({ host: '127.0.0.1', port: 0 });
    const readinessGateway = await buildGateway({
      env: gatewayEnvSchema.parse({ ...env, IDENTITY_SERVICE_URL: identity.listeningOrigin }),
      redis: { ping: async () => 'PONG', quit: async () => 'OK' },
    });
    const response = await readinessGateway.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json().dependencies.identity).toMatchObject({ ok: false, status: 503 });
    await readinessGateway.close();
    await identity.close();
  });

  it('reports App Log Service degradation without taking functional APIs down', async () => {
    const unavailableLogs = Fastify();
    unavailableLogs.get('/health/ready', async (_request, reply) => (
      reply.code(503).send({ status: 'degraded' })
    ));
    await unavailableLogs.listen({ host: '127.0.0.1', port: 0 });
    const readinessGateway = await buildGateway({
      env: gatewayEnvSchema.parse({ ...env, APP_LOG_SERVICE_URL: unavailableLogs.listeningOrigin }),
      redis: { ping: async () => 'PONG', quit: async () => 'OK' },
    });
    const response = await readinessGateway.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json().dependencies.appLogs).toMatchObject({ ok: false, status: 503 });
    await readinessGateway.close();
    await unavailableLogs.close();
  });
});
