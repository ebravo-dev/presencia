import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SECRET_FIELDS = [
  'POSTGRES_ADMIN_PASSWORD', 'ATTENDANCE_DB_PASSWORD', 'UAT_DB_PASSWORD', 'IDENTITY_DB_PASSWORD',
  'ACADEMIC_DB_PASSWORD', 'ATTENDANCE_SERVICE_DB_PASSWORD', 'COORDINATION_QUERY_DB_PASSWORD',
  'REDIS_PASSWORD', 'RABBITMQ_PASSWORD', 'JWT_SECRET', 'IDENTITY_JWT_SECRET',
  'INTERNAL_API_TOKEN', 'METRICS_TOKEN', 'UAT_METRICS_TOKEN', 'IDENTITY_METRICS_TOKEN',
  'ACADEMIC_METRICS_TOKEN', 'ATTENDANCE_METRICS_TOKEN', 'COORDINATION_QUERY_METRICS_TOKEN',
  'BINDING_JWT_SECRET', 'ATTENDANCE_JOB_ENCRYPTION_SECRET', 'UAT_SESSION_ENCRYPTION_SECRET',
  'DEMO_SESSION_SECRET',
];

const URL_FIELDS = [
  'ATTENDANCE_DATABASE_URL', 'UAT_DATABASE_URL', 'IDENTITY_DATABASE_URL', 'ACADEMIC_DATABASE_URL',
  'ATTENDANCE_SERVICE_DATABASE_URL', 'COORDINATION_QUERY_DATABASE_URL', 'REDIS_URL', 'RABBITMQ_URL',
];

export function parseEnvFile(source) {
  const result = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`Invalid environment line: ${rawLine}`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function requiredEnvironmentVariables(composeSource) {
  return [...new Set([...composeSource.matchAll(/\$\{([A-Z][A-Z0-9_]*):\?[^}]+\}/g)].map((match) => match[1]))].sort();
}

export function validateDokployEnvironment(environment, composeSource) {
  const errors = [];
  for (const field of requiredEnvironmentVariables(composeSource)) {
    if (!environment[field]?.trim()) errors.push(`${field} is required by Docker Compose.`);
  }
  for (const field of SECRET_FIELDS) {
    const value = environment[field];
    if (!value) continue;
    if (value.length < 32) errors.push(`${field} must contain at least 32 characters.`);
    if (/replace-with|change-me|example/i.test(value)) errors.push(`${field} still contains an example placeholder.`);
  }
  for (const field of ['SUPER_USER_PASSWORD', 'COORDINATOR_PASSWORD', 'PRESENCIA_DEMO_DEFAULT_PASSWORD']) {
    const value = environment[field];
    if (value && value.length < 12) errors.push(`${field} must contain at least 12 characters.`);
    if (value && /replace-with|change-me|example/i.test(value)) errors.push(`${field} still contains an example placeholder.`);
  }
  if (environment.RSA_PRIVATE_KEY && /replace-with|base64-encoded/i.test(environment.RSA_PRIVATE_KEY)) {
    errors.push('RSA_PRIVATE_KEY still contains an example placeholder.');
  }
  const secretOwners = new Map();
  for (const field of SECRET_FIELDS) {
    const value = environment[field];
    if (!value) continue;
    const previous = secretOwners.get(value);
    if (previous) errors.push(`${field} must be different from ${previous}.`);
    else secretOwners.set(value, field);
  }
  for (const field of URL_FIELDS) {
    const value = environment[field];
    if (!value) continue;
    try {
      const url = new URL(value);
      if (field.endsWith('DATABASE_URL') && !['postgres:', 'postgresql:'].includes(url.protocol)) {
        errors.push(`${field} must use PostgreSQL.`);
      }
      if (field === 'REDIS_URL' && !['redis:', 'rediss:'].includes(url.protocol)) errors.push(`${field} must use Redis.`);
      if (field === 'RABBITMQ_URL' && !['amqp:', 'amqps:'].includes(url.protocol)) errors.push(`${field} must use AMQP.`);
    } catch {
      errors.push(`${field} is not a valid URL. URL-encode special characters in passwords.`);
    }
  }
  try {
    const overrides = JSON.parse(environment.ROUTE_TARGET_OVERRIDES || '{}');
    if (!overrides || Array.isArray(overrides) || typeof overrides !== 'object') throw new Error();
  } catch {
    errors.push('ROUTE_TARGET_OVERRIDES must be a JSON object.');
  }
  const tracesExporter = environment.OTEL_TRACES_EXPORTER || 'none';
  if (!['none', 'otlp'].includes(tracesExporter)) {
    errors.push('OTEL_TRACES_EXPORTER must be none or otlp in production.');
  }
  if ((environment.OTEL_EXPORTER_OTLP_PROTOCOL || 'http/protobuf') !== 'http/protobuf') {
    errors.push('OTEL_EXPORTER_OTLP_PROTOCOL must be http/protobuf.');
  }
  if (tracesExporter === 'otlp') {
    try {
      const endpoint = new URL(environment.OTEL_EXPORTER_OTLP_ENDPOINT || '');
      if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error();
      if (endpoint.username || endpoint.password) {
        errors.push('OTEL_EXPORTER_OTLP_ENDPOINT must not embed credentials; use OTEL exporter headers in Dokploy.');
      }
    } catch {
      errors.push('OTEL_EXPORTER_OTLP_ENDPOINT must be an HTTP(S) URL when OTLP traces are enabled.');
    }
  }
  const origins = (environment.CORS_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.pathname !== '/' || url.search || url.hash) errors.push(`CORS origin must not include a path: ${origin}`);
    } catch {
      errors.push(`Invalid CORS origin: ${origin}`);
    }
  }
  if (environment.RABBITMQ_USER === 'guest') errors.push('RABBITMQ_USER must not be guest in production.');
  if (environment.PRESENCIA_DEBUG_MODE && !['true', 'false'].includes(environment.PRESENCIA_DEBUG_MODE)) {
    errors.push('PRESENCIA_DEBUG_MODE must be true or false.');
  }
  if (environment.PRESENCIA_APP_REVIEW_ENABLED && !['true', 'false'].includes(environment.PRESENCIA_APP_REVIEW_ENABLED)) {
    errors.push('PRESENCIA_APP_REVIEW_ENABLED must be true or false.');
  }
  if (environment.PRESENCIA_DEBUG_MODE === 'true' && environment.DEPLOYMENT_ENVIRONMENT !== 'demo') {
    errors.push('PRESENCIA_DEBUG_MODE=true requires DEPLOYMENT_ENVIRONMENT=demo in an isolated Dokploy project.');
  }
  if (environment.PRESENCIA_APP_REVIEW_ENABLED === 'true') {
    for (const field of ['PRESENCIA_APP_REVIEW_TEACHER_PASSWORD', 'PRESENCIA_APP_REVIEW_STUDENT_PASSWORD']) {
      const value = environment[field] || '';
      if (value.length < 12) errors.push(`${field} must contain at least 12 characters when App Review access is enabled.`);
      if (/replace-with|change-me|example/i.test(value)) errors.push(`${field} still contains an example placeholder.`);
    }
    if (environment.PRESENCIA_APP_REVIEW_TEACHER_PASSWORD === environment.PRESENCIA_APP_REVIEW_STUDENT_PASSWORD) {
      errors.push('The App Review teacher and student passwords must be different.');
    }
    if (environment.PRESENCIA_APP_REVIEW_TEACHER_USERNAME === environment.PRESENCIA_APP_REVIEW_STUDENT_USERNAME) {
      errors.push('The App Review teacher and student usernames must be different.');
    }
  }
  return errors;
}

async function main() {
  const envPath = process.argv[2];
  if (!envPath) throw new Error('Usage: node infra/scripts/validate-dokploy-env.mjs <environment-file>');
  const [environmentSource, composeSource] = await Promise.all([
    readFile(envPath, 'utf8'),
    readFile(new URL('../compose/docker-compose.microservices.yml', import.meta.url), 'utf8'),
  ]);
  const errors = validateDokployEnvironment(parseEnvFile(environmentSource), composeSource);
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Dokploy environment validation passed.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
