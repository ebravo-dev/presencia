import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoordinationQueryClient } from './coordination-query.client.js';

describe('CoordinationQueryClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('forwards dashboard filters over the private service boundary', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = new CoordinationQueryClient('http://coordination-query:3500', 'x'.repeat(32));
    await client.teachers({ coordinationId: 'coord-1', search: 'ana', page: 2, pageSize: 25 });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('/internal/v1/coordination/teachers?');
    expect(String(url)).toContain('coordinationId=coord-1');
    expect(request?.headers).toMatchObject({ 'x-internal-service-token': 'x'.repeat(32) });
  });
});
