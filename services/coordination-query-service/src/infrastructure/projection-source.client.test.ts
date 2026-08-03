import { describe, expect, it, vi } from 'vitest';
import { ProjectionSourceClient } from './projection-source.client.js';

describe('ProjectionSourceClient', () => {
  it('authenticates internal snapshot reads and validates their contract', async () => {
    const request = vi.fn<typeof fetch>(async (input, init) => new Response(JSON.stringify({ data: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = new ProjectionSourceClient('http://academic:3300', 'http://attendance:3400', 'internal-token', request);
    await expect(client.academic()).resolves.toEqual([]);
    expect(request).toHaveBeenCalledWith(
      'http://academic:3300/internal/v1/academic/coordination-projection',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-internal-service-token': 'internal-token' }) }),
    );
  });

  it('rejects malformed source snapshots instead of corrupting the read model', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [{ invalid: true }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = new ProjectionSourceClient('http://academic:3300', 'http://attendance:3400', 'internal-token', request);
    await expect(client.attendance()).rejects.toThrow();
  });
});
