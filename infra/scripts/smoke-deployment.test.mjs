import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { waitForDeploymentReady } from './smoke-deployment.mjs';

let server;
let baseUrl;
let attempts = 0;

before(async () => {
  server = createServer((request, response) => {
    attempts += 1;
    response.writeHead(request.url === '/health/ready' && attempts >= 3 ? 200 : 503);
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Smoke test server did not expose a TCP address.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
});

test('deployment readiness retries transient startup failures', async () => {
  await waitForDeploymentReady(baseUrl, { timeoutMs: 1_000, pollIntervalMs: 10, requestTimeoutMs: 100 });
  assert.equal(attempts, 3);
});
