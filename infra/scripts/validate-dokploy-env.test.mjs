import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCiEnvironment } from './create-ci-env.mjs';
import { parseEnvFile, requiredEnvironmentVariables, validateDokployEnvironment } from './validate-dokploy-env.mjs';

const composeUrl = new URL('../compose/docker-compose.microservices.yml', import.meta.url);
const exampleUrl = new URL('../compose/.env.dokploy.example', import.meta.url);

test('the Dokploy example declares every mandatory Compose variable', async () => {
  const [compose, example] = await Promise.all([readFile(composeUrl, 'utf8'), readFile(exampleUrl, 'utf8')]);
  const environment = parseEnvFile(example);
  const missing = requiredEnvironmentVariables(compose).filter((field) => !environment[field]);
  assert.deepEqual(missing, []);
});

test('validation rejects placeholders, reused secrets, and unsafe RabbitMQ defaults', () => {
  const compose = '${TOKEN:?TOKEN is required}';
  const errors = validateDokployEnvironment({
    TOKEN: 'set', JWT_SECRET: 'replace-with-at-least-32-random-characters',
    IDENTITY_JWT_SECRET: 'replace-with-at-least-32-random-characters', RABBITMQ_USER: 'guest',
  }, compose);
  assert.ok(errors.some((error) => error.includes('placeholder')));
  assert.ok(errors.some((error) => error.includes('different from')));
  assert.ok(errors.some((error) => error.includes('must not be guest')));
});

test('the env parser preserves JSON and URL values', () => {
  assert.deepEqual(parseEnvFile('ROUTE_TARGET_OVERRIDES={"/a":"identity"}\nURL=postgresql://u:p@db:5432/x?schema=public\n'), {
    ROUTE_TARGET_OVERRIDES: '{"/a":"identity"}', URL: 'postgresql://u:p@db:5432/x?schema=public',
  });
});

test('runtime containers gate Docker health on readiness', async () => {
  const dockerfiles = [
    '../../backend-apirest/Dockerfile',
    '../../frontend-coord/Dockerfile',
    '../../services/api-gateway/Dockerfile',
    '../../services/identity-service/Dockerfile',
    '../../services/academic-service/Dockerfile',
    '../../services/attendance-service/Dockerfile',
    '../../services/coordination-query-service/Dockerfile',
  ];
  for (const dockerfile of dockerfiles) {
    const source = await readFile(new URL(dockerfile, import.meta.url), 'utf8');
    assert.match(source, /HEALTHCHECK[\s\S]*\/health\/ready/, `${dockerfile} must check readiness`);
  }
});

test('application images run as non-root users', async () => {
  const dockerfiles = [
    '../../backend-apirest/Dockerfile',
    '../../frontend-coord/Dockerfile',
    '../../services/api-gateway/Dockerfile',
    '../../services/identity-service/Dockerfile',
    '../../services/academic-service/Dockerfile',
    '../../services/attendance-service/Dockerfile',
    '../../services/coordination-query-service/Dockerfile',
  ];
  for (const dockerfile of dockerfiles) {
    const source = await readFile(new URL(dockerfile, import.meta.url), 'utf8');
    assert.match(source, /\nUSER (?!root\b)[^\n]+/, `${dockerfile} must declare a non-root runtime user`);
  }
});

test('Dokploy runtime services use the hardened read-only profile', async () => {
  const compose = await readFile(composeUrl, 'utf8');
  assert.match(compose, /x-node-runtime-hardening:[\s\S]*read_only: true[\s\S]*cap_drop: \[ALL\][\s\S]*no-new-privileges:true/);
  for (const serviceName of [
    'uat-integration', 'identity-service', 'academic-service',
    'attendance-service', 'coordination-query-service', 'api-gateway',
  ]) {
    const start = compose.indexOf(`\n  ${serviceName}:`);
    assert.notEqual(start, -1, `${serviceName} must exist in the Dokploy Compose`);
    const remainder = compose.slice(start + 1);
    const nextService = remainder.match(/\n  [a-z][a-z0-9-]+:\n/);
    const end = nextService?.index === undefined ? -1 : start + 1 + nextService.index;
    const service = compose.slice(start, end === -1 ? undefined : end);
    assert.match(service, /<<: \*node-runtime-hardening/, `${serviceName} must use runtime hardening`);
  }
  assert.match(compose, /uat-integration:[\s\S]*127\.0\.0\.1:3100\/health\/ready/);
  assert.match(
    compose,
    /frontend-coord:[\s\S]*read_only: true[\s\S]*\/etc\/nginx\/conf\.d:size=1m,mode=0775,uid=101,gid=101[\s\S]*cap_drop: \[ALL\]/,
  );
});

test('the generated CI environment satisfies the production validator', async () => {
  const [compose, example] = await Promise.all([readFile(composeUrl, 'utf8'), readFile(exampleUrl, 'utf8')]);
  const environment = buildCiEnvironment(example);
  assert.deepEqual(validateDokployEnvironment(environment, compose), []);
});

test('PostgreSQL provisioning invokes its read-only script through the shell', async () => {
  const compose = await readFile(composeUrl, 'utf8');
  const start = compose.indexOf('\n  postgres-provision:');
  const end = compose.indexOf('\n  redis:', start);
  const service = compose.slice(start, end);
  assert.match(service, /command: \["\/bin\/sh", "\/opt\/presencia\/init-databases\.sh"\]/);
  assert.match(service, /init-databases\.sh:\/opt\/presencia\/init-databases\.sh:ro/);
});

test('Redis health authenticates with the same configured password', async () => {
  const compose = await readFile(composeUrl, 'utf8');
  const start = compose.indexOf('\n  redis:');
  const end = compose.indexOf('\n  rabbitmq:', start);
  const service = compose.slice(start, end);
  assert.match(service, /environment:\n\s+REDIS_PASSWORD: \$\{REDIS_PASSWORD:\?/);
  assert.match(service, /REDISCLI_AUTH=\\"\$\$\{REDIS_PASSWORD\}\\" redis-cli ping/);
});

test('optional coordinator provisioning stays empty when it is not configured', async () => {
  const compose = await readFile(composeUrl, 'utf8');
  assert.match(compose, /COORDINATOR_EMAIL: \$\{COORDINATOR_EMAIL:-\}/);
  assert.match(compose, /COORDINATOR_NAME: \$\{COORDINATOR_NAME:-\}/);
  assert.match(compose, /COORDINATOR_PASSWORD: \$\{COORDINATOR_PASSWORD:-\}/);
});

test('UAT has outbound access without joining the public Dokploy network', async () => {
  const compose = await readFile(composeUrl, 'utf8');
  const start = compose.indexOf('\n  uat-integration:');
  const end = compose.indexOf('\n  identity-migrate:', start);
  const service = compose.slice(start, end);
  assert.match(service, /networks: \[private, uat-egress\]/);
  assert.doesNotMatch(service, /dokploy-network/);
  assert.match(compose, /\n  uat-egress:\n    driver: bridge/);
});

test('the public web proxy exposes gateway health but never internal routes', async () => {
  const nginx = await readFile(new URL('../../frontend-coord/nginx/default.conf.template', import.meta.url), 'utf8');
  assert.match(nginx, /\|health\|metrics\)/);
  assert.doesNotMatch(nginx, /\|internal\|/);
});

test('Compose CI replaces both UAT portals with an isolated non-root simulator', async () => {
  const compose = await readFile(new URL('../compose/docker-compose.ci.yml', import.meta.url), 'utf8');
  assert.match(compose, /uat-portal-mock:[\s\S]*user: node[\s\S]*read_only: true[\s\S]*cap_drop: \[ALL\]/);
  assert.match(compose, /UAT_BASE_URL: http:\/\/uat-portal-mock:3900/);
  assert.match(compose, /UAT_ALUMNOS_BASE_URL: http:\/\/uat-portal-mock:3900/);
  assert.match(compose, /uat-portal-mock:[\s\S]*condition: service_healthy/);
});

test('the cross-service verifier also runs with the hardened Node 24 runtime', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/backend-platform.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /node(?:-version:|:) 24\.7/);
  assert.doesNotMatch(workflow, /up --build --detach --wait/);
  assert.match(workflow, /up --build --detach/);
  assert.match(workflow, /docker run --rm[\s\S]*--user node[\s\S]*--read-only[\s\S]*--cap-drop ALL[\s\S]*node:24-alpine/);
});

test('OpenAPI exactly matches the implemented public UAT routes', async () => {
  const [openapi, routes] = await Promise.all([
    readFile(new URL('../../backend-apirest/docs/openapi.yaml', import.meta.url), 'utf8'),
    readFile(new URL('../../backend-apirest/src/presentation/http/routes/uat.routes.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(openapi, /^  \/api\/uat\/asistencia\/lotes(?:\/\{batchId\})?:$/m);
  assert.match(openapi, /^  \/api\/uat\/asistencia\/registros\/estado:$/m);
  const implemented = [...routes.matchAll(/fastify\.(?:get|post|put|delete)\(\s*['"](\/api\/uat\/[^'"]+)/g)]
    .map((match) => match[1].replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}'))
    .sort();
  const documented = [...openapi.matchAll(/^  (\/api\/uat\/[^:]+):$/gm)].map((match) => match[1]).sort();
  assert.deepEqual(documented, implemented);
});
