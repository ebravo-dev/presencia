import { LogIngestionService } from './application/log-ingestion.service.js';
import { PrismaClient } from './generated/prisma/index.js';
import { loadAppLogEnv } from './infrastructure/config.js';
import { PrismaLogRepository } from './infrastructure/prisma-log.repository.js';
import { buildAppLogApp } from './presentation/app.js';

const env = loadAppLogEnv();
const prisma = new PrismaClient();
await prisma.$connect();
const repository = new PrismaLogRepository(prisma);
const app = await buildAppLogApp({
  env,
  repository,
  ingestion: new LogIngestionService(repository),
  ready: () => prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
});
app.addHook('onClose', () => prisma.$disconnect());

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  installShutdownHandlers();
} catch (error) {
  app.log.fatal(error, 'No se pudo iniciar App Log Service.');
  process.exitCode = 1;
}

function installShutdownHandlers(): void {
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Cerrando App Log Service.');
    await app.close();
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
