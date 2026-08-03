import { Redis } from 'ioredis';
import { AuthenticatedSessionService } from './application/authenticated-session.service.js';
import { IdentityTokenService } from './application/token.service.js';
import { loadIdentityEnv } from './infrastructure/config.js';
import { PrismaClient } from './generated/prisma/index.js';
import { PrismaIdentityRepository } from './infrastructure/prisma-identity.repository.js';
import { RedisIdentitySessionStore } from './infrastructure/redis-session.store.js';
import { buildIdentityApp } from './presentation/app.js';

const env = loadIdentityEnv();
const prisma = new PrismaClient();
const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
await redis.connect();
await prisma.$connect();

const tokens = new IdentityTokenService(
  env.IDENTITY_JWT_SECRET,
  env.IDENTITY_JWT_PREVIOUS_SECRET,
  env.IDENTITY_JWT_ISSUER,
  env.IDENTITY_JWT_AUDIENCE,
  env.IDENTITY_SESSION_TTL_SECONDS,
);
const sessions = new AuthenticatedSessionService(
  new PrismaIdentityRepository(prisma),
  new RedisIdentitySessionStore(redis),
  tokens,
  env.IDENTITY_SESSION_TTL_SECONDS * 1_000,
);
const app = await buildIdentityApp({
  env,
  sessions,
  readiness: {
    async check() {
      const [database, redisReady] = await Promise.all([
        prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
        redis.ping().then((value) => value === 'PONG').catch(() => false),
      ]);
      return { database, redis: redisReady };
    },
  },
});

app.addHook('onClose', async () => {
  await Promise.all([prisma.$disconnect(), redis.quit()]);
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  installShutdownHandlers();
} catch (error) {
  app.log.fatal(error, 'No se pudo iniciar Identity Service.');
  process.exitCode = 1;
}

function installShutdownHandlers(): void {
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Cerrando Identity Service.');
    await app.close();
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
