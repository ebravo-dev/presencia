import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { AcademicServiceClient } from './academic-service.client.js';
import { AttendanceServiceCommandClient } from './attendance-service-command.client.js';
import { CoordinationQueryClient } from './coordination-query.client.js';
import { DemoPortalClient } from './demo-portal.client.js';
import { IdentityServiceClient } from './identity-service.client.js';

describe('demo reset service clients', () => {
  it('does not describe a bodyless DELETE as JSON', async () => {
    const app = Fastify();
    const receivedContentTypes: Array<string | undefined> = [];
    const rememberContentType = (value: string | undefined) => {
      receivedContentTypes.push(value);
    };
    app.delete('/internal/v1/demo/data', async (request) => {
      rememberContentType(request.headers['content-type']);
      return { data: { deleted: { teachers: 0, students: 0, classes: 0, attendanceWrites: 0 } } };
    });
    app.delete('/internal/v1/identities/demo-data', async (request) => {
      rememberContentType(request.headers['content-type']);
      return { data: { identities: 0 } };
    });
    app.delete('/internal/v1/academic/demo-data', async (request, reply) => {
      rememberContentType(request.headers['content-type']);
      return reply.code(204).send();
    });
    app.delete('/internal/v1/attendance/demo-data', async (request, reply) => {
      rememberContentType(request.headers['content-type']);
      return reply.code(204).send();
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const token = 'test-internal-service-token-with-at-least-32-characters';

    try {
      await Promise.all([
        new DemoPortalClient(app.listeningOrigin, token).resetData(),
        new IdentityServiceClient(app.listeningOrigin, token).resetDemoData(),
        new AcademicServiceClient(app.listeningOrigin, token).resetDemoData(),
        new AttendanceServiceCommandClient(app.listeningOrigin, token).resetDemoData(),
      ]);
    } finally {
      await app.close();
    }

    expect(receivedContentTypes).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('sends the internal purge confirmation to every database service', async () => {
    const app = Fastify();
    const confirmations: string[] = [];
    const purge = async (request: { body: unknown }) => {
      confirmations.push((request.body as { confirmation: string }).confirmation);
      return { data: { purged: true } };
    };
    app.post('/internal/v1/identities/data/purge', purge);
    app.post('/internal/v1/academic/data/purge', purge);
    app.post('/internal/v1/attendance/data/purge', purge);
    app.post('/internal/v1/coordination/data/purge', purge);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const token = 'test-internal-service-token-with-at-least-32-characters';

    try {
      await Promise.all([
        new IdentityServiceClient(app.listeningOrigin, token).purgeAllData(),
        new AcademicServiceClient(app.listeningOrigin, token).purgeAllData(),
        new AttendanceServiceCommandClient(app.listeningOrigin, token).purgeAllData(),
        new CoordinationQueryClient(app.listeningOrigin, token).purgeAllData(),
      ]);
    } finally {
      await app.close();
    }

    expect(confirmations).toEqual([
      'PURGE_ALL_DATA', 'PURGE_ALL_DATA', 'PURGE_ALL_DATA', 'PURGE_ALL_DATA',
    ]);
  });
});
