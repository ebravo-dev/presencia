import { describe, expect, it } from 'vitest';
import type { StoredUatSessionBase } from '../../domain/types/uat.interfaces.js';
import type { SessionKeyValueStore } from './redis-key-value.store.js';
import { RedisUatSessionStore } from './redis-session.store.js';
import type { SessionCodec } from './session-codec.js';

interface TestSession extends StoredUatSessionBase {
  value: string;
}

describe('RedisUatSessionStore', () => {
  it('shares a session between independent service replicas', async () => {
    const keyValueStore = new FakeKeyValueStore();
    let nowMs = Date.parse('2026-08-02T12:00:00.000Z');
    const options = {
      prefix: 'test:teacher-session',
      ttlMs: 60_000,
      now: () => new Date(nowMs),
    };
    const replicaA = new RedisUatSessionStore(keyValueStore, testCodec, options);
    const replicaB = new RedisUatSessionStore(keyValueStore, testCodec, options);
    const initialDate = new Date(nowMs);

    await replicaA.create('session-1', {
      id: 'session-1',
      username: 'teacher@uat.edu.mx',
      value: 'cookie-state',
      createdAt: initialDate,
      lastUsedAt: initialDate,
      expiresAt: initialDate,
    });

    nowMs += 5_000;
    const restored = await replicaB.get('session-1');
    expect(restored).toMatchObject({
      id: 'session-1',
      username: 'teacher@uat.edu.mx',
      value: 'cookie-state',
    });
    expect(restored?.lastUsedAt.toISOString()).toBe('2026-08-02T12:00:05.000Z');
    expect(restored?.expiresAt.toISOString()).toBe('2026-08-02T12:01:05.000Z');
    expect(await replicaA.size()).toBe(1);
  });

  it('removes an expired encrypted payload even if Redis has not evicted it yet', async () => {
    const keyValueStore = new FakeKeyValueStore();
    const store = new RedisUatSessionStore(keyValueStore, testCodec, {
      prefix: 'test:student-session',
      ttlMs: 1_000,
      now: () => new Date('2026-08-02T12:00:10.000Z'),
    });
    const expired = new Date('2026-08-02T12:00:00.000Z');
    await keyValueStore.setWithTtl('test:student-session:expired', testCodec.encode({
      id: 'expired',
      username: 'student@uat.edu.mx',
      value: 'expired-state',
      createdAt: expired,
      lastUsedAt: expired,
      expiresAt: expired,
    }), 60_000);

    expect(await store.get('expired')).toBeNull();
    expect(await store.size()).toBe(0);
  });

  it('clears only sessions that belong to its own prefix', async () => {
    const keyValueStore = new FakeKeyValueStore();
    const store = new RedisUatSessionStore(keyValueStore, testCodec, {
      prefix: 'test:teacher-session', ttlMs: 60_000,
    });
    const now = new Date();
    await store.create('teacher-1', {
      id: 'teacher-1', username: 'teacher@uat.edu.mx', value: 'teacher',
      createdAt: now, lastUsedAt: now, expiresAt: now,
    });
    await keyValueStore.setWithTtl('test:student-session:student-1', 'preserved', 60_000);

    expect(await store.clear()).toBe(1);
    expect(await store.size()).toBe(0);
    expect(await keyValueStore.get('test:student-session:student-1')).toBe('preserved');
  });
});

const testCodec: SessionCodec<TestSession> = {
  encode: (session) => JSON.stringify(session),
  decode: (value) => {
    const payload = JSON.parse(value) as Record<string, string>;
    return {
      id: payload.id ?? '',
      username: payload.username ?? '',
      value: payload.value ?? '',
      createdAt: new Date(payload.createdAt ?? ''),
      lastUsedAt: new Date(payload.lastUsedAt ?? ''),
      expiresAt: new Date(payload.expiresAt ?? ''),
    };
  },
};

class FakeKeyValueStore implements SessionKeyValueStore {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setWithTtl(key: string, value: string, _ttlMs: number): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async scan(_cursor: string, pattern: string, _count: number): Promise<readonly [string, string[]]> {
    const prefix = pattern.slice(0, -1);
    return ['0', [...this.values.keys()].filter((key) => key.startsWith(prefix))];
  }
}
