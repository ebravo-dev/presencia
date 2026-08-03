import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseEnvFile, validateDokployEnvironment } from './validate-dokploy-env.mjs';

const RANDOM_SECRET_FIELDS = [
  'POSTGRES_ADMIN_PASSWORD', 'ATTENDANCE_DB_PASSWORD', 'UAT_DB_PASSWORD', 'IDENTITY_DB_PASSWORD',
  'ACADEMIC_DB_PASSWORD', 'ATTENDANCE_SERVICE_DB_PASSWORD', 'COORDINATION_QUERY_DB_PASSWORD',
  'REDIS_PASSWORD', 'RABBITMQ_PASSWORD', 'JWT_SECRET', 'IDENTITY_JWT_SECRET',
  'INTERNAL_API_TOKEN', 'METRICS_TOKEN', 'IDENTITY_METRICS_TOKEN',
  'ACADEMIC_METRICS_TOKEN', 'ATTENDANCE_METRICS_TOKEN', 'COORDINATION_QUERY_METRICS_TOKEN',
  'BINDING_JWT_SECRET', 'ATTENDANCE_JOB_ENCRYPTION_SECRET', 'UAT_SESSION_ENCRYPTION_SECRET',
];

function randomSecret(label) {
  return `ci-${label.toLowerCase()}-${randomBytes(32).toString('base64url')}`;
}

export function buildCiEnvironment(exampleSource) {
  const environment = parseEnvFile(exampleSource);
  for (const field of RANDOM_SECRET_FIELDS) environment[field] = randomSecret(field);

  environment.SUPER_USER_PASSWORD = randomSecret('super-user');
  environment.COORDINATOR_EMAIL = '';
  environment.COORDINATOR_NAME = '';
  environment.COORDINATOR_PASSWORD = '';
  environment.CORS_ALLOWED_ORIGINS = 'http://127.0.0.1:18080';
  environment.COORDINATION_WEB_ORIGIN = 'http://127.0.0.1:18080';
  environment.DOKPLOY_NETWORK_NAME = 'dokploy-network';
  environment.ROUTE_TARGET_OVERRIDES = '{}';
  environment.COORDINATION_QUERY_RECONCILE_INTERVAL_MS = '60000';

  environment.ATTENDANCE_DATABASE_URL = databaseUrl(environment, 'ATTENDANCE');
  environment.UAT_DATABASE_URL = databaseUrl(environment, 'UAT');
  environment.IDENTITY_DATABASE_URL = databaseUrl(environment, 'IDENTITY');
  environment.ACADEMIC_DATABASE_URL = databaseUrl(environment, 'ACADEMIC');
  environment.ATTENDANCE_SERVICE_DATABASE_URL = databaseUrl(environment, 'ATTENDANCE_SERVICE');
  environment.COORDINATION_QUERY_DATABASE_URL = databaseUrl(environment, 'COORDINATION_QUERY');
  environment.REDIS_URL = `redis://:${encodeURIComponent(environment.REDIS_PASSWORD)}@redis:6379/0`;
  environment.RABBITMQ_USER = `ci_${randomBytes(8).toString('hex')}`;
  environment.RABBITMQ_URL = `amqp://${encodeURIComponent(environment.RABBITMQ_USER)}:${encodeURIComponent(environment.RABBITMQ_PASSWORD)}@rabbitmq:5672`;

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  environment.RSA_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');
  return environment;
}

export function serializeEnvironment(environment) {
  return `${Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
}

function databaseUrl(environment, prefix) {
  const user = environment[`${prefix}_DB_USER`];
  const password = environment[`${prefix}_DB_PASSWORD`];
  const database = environment[`${prefix}_DB_NAME`];
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@postgres:5432/${encodeURIComponent(database)}?schema=public`;
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error('Usage: node infra/scripts/create-ci-env.mjs <output-file>');
  const [exampleSource, composeSource] = await Promise.all([
    readFile(new URL('../compose/.env.dokploy.example', import.meta.url), 'utf8'),
    readFile(new URL('../compose/docker-compose.microservices.yml', import.meta.url), 'utf8'),
  ]);
  const environment = buildCiEnvironment(exampleSource);
  const errors = validateDokployEnvironment(environment, composeSource);
  if (errors.length > 0) throw new Error(`Generated CI environment is invalid:\n${errors.join('\n')}`);
  await writeFile(outputPath, serializeEnvironment(environment), { mode: 0o600 });
  process.stdout.write(`Generated validated CI environment at ${outputPath}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
