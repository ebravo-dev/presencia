import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const checks = [
  { path: '/coordinacion/', expected: 200 },
  { path: '/health/live', expected: 200 },
  { path: '/health/ready', expected: 200 },
  { path: '/metrics', expected: 401 },
  { path: '/api/uat/alumnos/horario', expected: 401 },
  { path: '/api/coordinacion/auth/me', expected: 401 },
  { path: '/api/superUsuario/auth/me', expected: 401 },
  { path: '/internal/v1/attendance/coordination-projection', expected: 404 },
];

export async function waitForDeploymentReady(baseUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  const deadline = Date.now() + timeoutMs;
  let lastResult = 'not attempted';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/health/ready', baseUrl), {
        redirect: 'manual', signal: AbortSignal.timeout(requestTimeoutMs), headers: { accept: 'application/json' },
      });
      if (response.status === 200) return;
      lastResult = `HTTP ${response.status}`;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : 'unknown error';
    }
    await delay(pollIntervalMs);
  }

  throw new Error(`Deployment did not become ready within ${timeoutMs}ms. Last result: ${lastResult}`);
}

export async function runDeploymentSmoke(baseUrl) {
  await waitForDeploymentReady(baseUrl);
  let failed = false;
  for (const check of checks) {
    try {
      const response = await fetch(new URL(check.path, baseUrl), {
        redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' },
      });
      const ok = response.status === check.expected;
      process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${check.path} HTTP ${response.status} (expected ${check.expected})\n`);
      failed ||= !ok;
    } catch (error) {
      process.stderr.write(`FAIL ${check.path}: ${error instanceof Error ? error.message : 'unknown error'}\n`);
      failed = true;
    }
  }
  if (failed) process.exitCode = 1;
}

async function main() {
  const baseUrl = process.env.PRESENCIA_BASE_URL;
  if (!baseUrl) throw new Error('PRESENCIA_BASE_URL is required.');
  await runDeploymentSmoke(baseUrl);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
