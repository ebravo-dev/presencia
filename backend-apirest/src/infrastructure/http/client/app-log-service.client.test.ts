import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLogServiceClient } from './app-log-service.client.js';

describe('AppLogServiceClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('forwards log filters only over the private authenticated boundary', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = new AppLogServiceClient('http://app-log-service:3600', 'x'.repeat(32));
    await client.search({ application: 'STUDENT', level: 'ERROR', q: 'bluetooth', limit: 25 });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('/internal/v1/app-logs?');
    expect(String(url)).toContain('application=STUDENT');
    expect(String(url)).toContain('level=ERROR');
    expect(request?.headers).toMatchObject({ 'x-internal-service-token': 'x'.repeat(32) });
  });
});
