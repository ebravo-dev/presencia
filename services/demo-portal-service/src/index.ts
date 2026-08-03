import { Redis } from 'ioredis';
import { buildDemoPortalApp } from './app.js';
import { DemoCatalogService } from './catalog.service.js';
import { loadDemoPortalEnv } from './config.js';
import { RedisDemoPortalRepository } from './repository.js';

const env = loadDemoPortalEnv();
const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2, enableReadyCheck: true });
await redis.connect();
const catalog = new DemoCatalogService(new RedisDemoPortalRepository(redis), env);
await catalog.initialize();
const app = await buildDemoPortalApp({ env, catalog, ready: async () => await redis.ping() === 'PONG' });
await app.listen({ host: env.HOST, port: env.PORT });

const shutdown = async () => {
  await app.close();
  await redis.quit();
};
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
