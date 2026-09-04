import { describe, expect, it } from 'vitest';
import { LogIngestionService } from '../application/log-ingestion.service.js';
import type { LogRepository } from '../domain/log.repository.js';
import { appLogEnvSchema } from '../infrastructure/config.js';
import { buildAppLogApp } from './app.js';

const ingestionKey = 'app-log-ingestion-key-with-at-least-32-characters';
const internalToken = 'internal-service-token-with-at-least-32-characters';
const metricsToken = 'development-metrics-token-change-me';

describe('App Log HTTP API', () => {
  it('persists a validated batch and only acknowledges committed event IDs', async () => {
    let storedMessage = '';
    let storedContext: Record<string, unknown> | undefined;
    const repository = fakeRepository({
      append: async (batch) => {
        storedMessage = batch.events[0]!.message;
        storedContext = batch.events[0]!.context;
        return { acceptedEventIds: [batch.events[0]!.eventId], inserted: 1, duplicates: 0 };
      },
    });
    const app = await testApp(repository);
    const response = await app.inject({
      method: 'POST', url: '/api/app-logs/batches', headers: { 'x-app-log-key': ingestionKey },
      payload: batch({ message: 'request token=abc123 failed', context: { password: 'bad-secret', safe: 'value' } }),
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().data.acceptedEventIds).toEqual(['74b29734-65a8-48b2-9e6e-8cd01f1a0016']);
    expect(storedMessage).toContain('[REDACTED]');
    expect(storedContext).toEqual({ password: '[REDACTED]', safe: 'value' });
    await app.close();
  });

  it('rejects invalid clients and malformed batches', async () => {
    const app = await testApp(fakeRepository());
    expect((await app.inject({ method: 'POST', url: '/api/app-logs/batches', payload: batch() })).statusCode).toBe(401);
    const malformed = await app.inject({
      method: 'POST', url: '/api/app-logs/batches', headers: { 'x-app-log-key': ingestionKey },
      payload: { ...batch(), events: [] },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('keeps queries private for the authenticated BFF', async () => {
    const app = await testApp(fakeRepository());
    expect((await app.inject({ method: 'GET', url: '/internal/v1/app-logs' })).statusCode).toBe(404);
    expect((await app.inject({
      method: 'GET', url: '/internal/v1/app-logs?limit=10', headers: { 'x-internal-service-token': internalToken },
    })).statusCode).toBe(200);
    await app.close();
  });

  it('returns rate limiting as 429 instead of masking it as a server error', async () => {
    const app = await testApp(fakeRepository(), { INGESTION_RATE_LIMIT_MAX: 1 });
    const request = {
      method: 'POST' as const,
      url: '/api/app-logs/batches',
      headers: { 'x-app-log-key': ingestionKey },
      payload: batch(),
    };
    expect((await app.inject(request)).statusCode).toBe(202);
    expect((await app.inject(request)).statusCode).toBe(429);
    await app.close();
  });

  it('protects operational metrics and exposes normalized HTTP signals', async () => {
    const app = await testApp(fakeRepository());
    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
    const response = await app.inject({
      method: 'GET', url: '/metrics', headers: { authorization: `Bearer ${metricsToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('presencia_app_logs_http_requests_total');
    expect(response.body).toContain('route="/metrics"');
    await app.close();
  });

  it('fails production startup with development or reused secrets', () => {
    expect(appLogEnvSchema.safeParse({ NODE_ENV: 'production' }).success).toBe(false);
    expect(appLogEnvSchema.safeParse({
      NODE_ENV: 'production', APP_LOG_INGESTION_KEY: ingestionKey,
      INTERNAL_API_TOKEN: ingestionKey, METRICS_TOKEN: 'different-metrics-token-with-32-characters',
    }).success).toBe(false);
  });
});

function batch(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1, batchId: '74b29734-65a8-48b2-9e6e-8cd01f1a0015', sentAt: '2026-09-04T12:00:00.000Z',
    events: [{
      eventId: '74b29734-65a8-48b2-9e6e-8cd01f1a0016', sequence: 1, level: 'ERROR', application: 'STUDENT',
      eventName: 'app.unhandled_error', message: 'Unhandled error', occurredAt: '2026-09-04T11:59:00.000Z',
      installationId: '74b29734-65a8-48b2-9e6e-8cd01f1a0017', appSessionId: '74b29734-65a8-48b2-9e6e-8cd01f1a0018',
      appVersion: '1.2.0', buildNumber: '5', platform: 'android', osVersion: 'Android 15', ...overrides,
    }],
  };
}

function fakeRepository(overrides: Partial<LogRepository> = {}): LogRepository {
  return {
    append: async (input) => ({ acceptedEventIds: input.events.map(({ eventId }) => eventId), inserted: input.events.length, duplicates: 0 }),
    search: async () => ({ data: [], meta: { nextCursor: null, total: 0, generatedAt: new Date().toISOString() } }),
    summary: async () => ({
      total: 0, last24Hours: 0, errorsLast24Hours: 0, fatalLast24Hours: 0,
      activeInstallationsLast24Hours: 0, byApplication: [], byLevel: [], topErrors: [], generatedAt: new Date().toISOString(),
    }),
    ...overrides,
  };
}

async function testApp(repository: LogRepository, overrides: Record<string, unknown> = {}) {
  const env = appLogEnvSchema.parse({
    NODE_ENV: 'test', APP_LOG_INGESTION_KEY: ingestionKey, INTERNAL_API_TOKEN: internalToken, ...overrides,
  });
  return buildAppLogApp({ env, repository, ingestion: new LogIngestionService(repository), ready: async () => true });
}
