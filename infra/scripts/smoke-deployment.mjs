const baseUrl = process.env.PRESENCIA_BASE_URL;
if (!baseUrl) throw new Error('PRESENCIA_BASE_URL is required.');

const checks = [
  { path: '/health/live', expected: 200 },
  { path: '/health/ready', expected: 200 },
  { path: '/metrics', expected: 401 },
  { path: '/internal/v1/attendance/coordination-projection', expected: 404 },
];

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
