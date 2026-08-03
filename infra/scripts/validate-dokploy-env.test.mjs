import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
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
