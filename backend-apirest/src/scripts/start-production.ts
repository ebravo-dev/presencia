import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const maxAttempts = positiveInteger(process.env.DATABASE_MIGRATION_MAX_ATTEMPTS, 10);
const retryDelayMs = positiveInteger(process.env.DATABASE_MIGRATION_RETRY_MS, 3_000);
const prismaExecutable = resolve(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`Aplicando migraciones PostgreSQL (intento ${attempt}/${maxAttempts})...`);
  const exitCode = await run(prismaExecutable, ['migrate', 'deploy']);

  if (exitCode === 0) break;
  if (attempt === maxAttempts) {
    console.error('No fue posible aplicar las migraciones PostgreSQL. La API no se iniciara.');
    process.exit(1);
  }

  await delay(retryDelayMs);
}

const provisionExitCode = await run(process.execPath, [
  resolve(process.cwd(), 'dist', 'scripts', 'import-coordinators-to-identity.js'),
]);

if (provisionExitCode !== 0) {
  console.error('No fue posible adoptar/provisionar las cuentas en Identity. La API no se iniciara.');
  process.exit(1);
}

const app = spawn(process.execPath, [resolve(process.cwd(), 'dist', 'app.js')], {
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => app.kill(signal));
}

app.once('error', (error) => {
  console.error('No fue posible iniciar backend-apirest.', error);
  process.exitCode = 1;
});

app.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 0 : 1);
});

function run(command: string, args: string[]): Promise<number | null> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { env: process.env, stdio: 'inherit' });
    child.once('error', rejectRun);
    child.once('exit', (code) => resolveRun(code));
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
