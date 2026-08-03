import { pathToFileURL } from 'node:url';

const DEFAULTS = Object.freeze({
  requests: 200,
  concurrency: 20,
  warmupRequests: 5,
  p95LimitMs: 750,
  p99LimitMs: 1_500,
  maxErrorRate: 0.01,
});

export function percentile(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('At least one latency sample is required.');
  if (!(quantile > 0 && quantile <= 1)) throw new Error('Quantile must be greater than zero and at most one.');
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

export function loadOptions(source = process.env) {
  return {
    requests: integerOption(source.PRESENCIA_LOAD_REQUESTS, DEFAULTS.requests, 'PRESENCIA_LOAD_REQUESTS', 1, 280),
    concurrency: integerOption(source.PRESENCIA_LOAD_CONCURRENCY, DEFAULTS.concurrency, 'PRESENCIA_LOAD_CONCURRENCY', 1, 100),
    warmupRequests: integerOption(source.PRESENCIA_LOAD_WARMUP_REQUESTS, DEFAULTS.warmupRequests, 'PRESENCIA_LOAD_WARMUP_REQUESTS', 0, 20),
    p95LimitMs: numberOption(source.PRESENCIA_LOAD_P95_MS, DEFAULTS.p95LimitMs, 'PRESENCIA_LOAD_P95_MS', 1, 60_000),
    p99LimitMs: numberOption(source.PRESENCIA_LOAD_P99_MS, DEFAULTS.p99LimitMs, 'PRESENCIA_LOAD_P99_MS', 1, 60_000),
    maxErrorRate: numberOption(source.PRESENCIA_LOAD_MAX_ERROR_RATE, DEFAULTS.maxErrorRate, 'PRESENCIA_LOAD_MAX_ERROR_RATE', 0, 1),
  };
}

async function main() {
  if (process.env.PRESENCIA_LOAD_TEST_ALLOW !== 'ci') {
    throw new Error('Refusing load verification without PRESENCIA_LOAD_TEST_ALLOW=ci.');
  }
  const gatewayUrl = process.env.API_GATEWAY_URL ?? 'http://api-gateway:8080';
  const uatIntegrationUrl = process.env.UAT_INTEGRATION_URL ?? 'http://uat-integration:3100';
  const metricsToken = requiredEnvironmentValue(process.env.UAT_METRICS_TOKEN, 'UAT_METRICS_TOKEN');
  const options = loadOptions();
  const sessionId = await createMockTeacherSession(gatewayUrl);
  const request = (sequence) => measuredCatalogRequest(gatewayUrl, sessionId, sequence);

  for (let index = 0; index < options.warmupRequests; index += 1) await request(`warmup-${index}`);

  const startedAt = performance.now();
  const results = [];
  for (let offset = 0; offset < options.requests; offset += options.concurrency) {
    const batchSize = Math.min(options.concurrency, options.requests - offset);
    results.push(...await Promise.all(Array.from(
      { length: batchSize },
      (_, index) => request(offset + index),
    )));
  }
  const elapsedMs = performance.now() - startedAt;
  const failures = results.filter((result) => !result.ok);
  const errorRate = failures.length / options.requests;
  const latencies = results.map((result) => result.durationMs);
  const report = {
    requests: options.requests,
    concurrency: options.concurrency,
    requestsPerSecond: round(options.requests / (elapsedMs / 1_000)),
    errorRate: round(errorRate),
    p50Ms: round(percentile(latencies, 0.5)),
    p95Ms: round(percentile(latencies, 0.95)),
    p99Ms: round(percentile(latencies, 0.99)),
  };

  if (errorRate > options.maxErrorRate) {
    throw new Error(`Load error-rate SLO exceeded: ${JSON.stringify(report)} statuses=${failureSummary(failures)}`);
  }
  if (report.p95Ms > options.p95LimitMs || report.p99Ms > options.p99LimitMs) {
    throw new Error(`Load latency SLO exceeded: ${JSON.stringify(report)}`);
  }
  await verifyProtectedMetrics(uatIntegrationUrl, metricsToken);
  process.stdout.write(`PASS scaled UAT read load SLO ${JSON.stringify(report)}\n`);
  process.stdout.write('PASS protected UAT Integration metrics endpoint\n');
}

async function verifyProtectedMetrics(uatIntegrationUrl, metricsToken) {
  const metricsUrl = new URL('/metrics', uatIntegrationUrl);
  const unauthorizedResponse = await fetch(metricsUrl, { signal: AbortSignal.timeout(10_000) });
  await unauthorizedResponse.arrayBuffer();
  if (unauthorizedResponse.status !== 401) {
    throw new Error(`UAT metrics endpoint accepted an unauthenticated request with ${unauthorizedResponse.status}.`);
  }

  const authorizedResponse = await fetch(metricsUrl, {
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${metricsToken}` },
  });
  const body = await authorizedResponse.text();
  if (!authorizedResponse.ok || !body.includes('# HELP presencia_uat_integration_http_requests_total')) {
    throw new Error(`UAT metrics endpoint verification failed with ${authorizedResponse.status}.`);
  }
}

async function createMockTeacherSession(gatewayUrl) {
  const response = await fetch(new URL('/api/uat/sessions', gatewayUrl), {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'ci-load-login' },
    body: JSON.stringify({ username: 'teacher-ci@uat.edu.mx', password: 'teacher-ci-password' }),
  });
  const payload = await response.json().catch(() => undefined);
  if (response.status !== 201 || typeof payload?.sessionId !== 'string') {
    throw new Error(`Mock teacher login failed with ${response.status}.`);
  }
  return payload.sessionId;
}

async function measuredCatalogRequest(gatewayUrl, sessionId, sequence) {
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL('/api/uat/catalogos/niveles-educativos', gatewayUrl), {
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: 'application/json',
        'x-uat-session-id': sessionId,
        'x-correlation-id': `ci-load-${sequence}`,
      },
    });
    await response.arrayBuffer();
    return { ok: response.status === 200, status: response.status, durationMs: performance.now() - startedAt };
  } catch {
    return { ok: false, status: 0, durationMs: performance.now() - startedAt };
  }
}

function integerOption(value, fallback, name, minimum, maximum) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function numberOption(value, fallback, name, minimum, maximum) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function requiredEnvironmentValue(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required.`);
  return value;
}

function failureSummary(failures) {
  const statuses = new Map();
  for (const failure of failures) statuses.set(failure.status, (statuses.get(failure.status) ?? 0) + 1);
  return JSON.stringify(Object.fromEntries(statuses));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
