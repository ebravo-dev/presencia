import type { Redis } from 'ioredis';
import type { DemoPortalState } from './model.js';

export interface DemoPortalRepository {
  load(): Promise<DemoPortalState | null>;
  save(state: DemoPortalState): Promise<void>;
}

export class RedisDemoPortalRepository implements DemoPortalRepository {
  constructor(
    private readonly redis: Redis,
    private readonly key = 'presencia:demo-portal:state:v1',
  ) {}

  async load(): Promise<DemoPortalState | null> {
    const value = await this.redis.get(this.key);
    return value ? JSON.parse(value) as DemoPortalState : null;
  }

  async save(state: DemoPortalState): Promise<void> {
    await this.redis.set(this.key, JSON.stringify(state));
  }
}

export class MemoryDemoPortalRepository implements DemoPortalRepository {
  private state: DemoPortalState | null = null;

  async load(): Promise<DemoPortalState | null> {
    return this.state ? structuredClone(this.state) : null;
  }

  async save(state: DemoPortalState): Promise<void> {
    this.state = structuredClone(state);
  }
}
