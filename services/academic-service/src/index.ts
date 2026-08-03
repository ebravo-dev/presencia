import { ApplyAcademicSnapshotService } from './application/apply-academic-snapshot.service.js';
import { ApplyStudentAcademicSnapshotService } from './application/apply-student-academic-snapshot.service.js';
import { SharedClassService } from './application/shared-class.service.js';
import { loadAcademicEnv } from './infrastructure/config.js';
import { PrismaClient } from './generated/prisma/index.js';
import { PrismaAcademicRepository } from './infrastructure/prisma-academic.repository.js';
import { PrismaSharedClassRepository } from './infrastructure/prisma-shared-class.repository.js';
import { buildAcademicApp } from './presentation/app.js';
import { AcademicOutboxPublisher } from './infrastructure/academic-outbox.publisher.js';

const env = loadAcademicEnv();
const prisma = new PrismaClient();
await prisma.$connect();
const repository = new PrismaAcademicRepository(prisma);
const sharedClassRepository = new PrismaSharedClassRepository(prisma);
const outbox = new AcademicOutboxPublisher(prisma, env.RABBITMQ_URL, env.OUTBOX_POLL_INTERVAL_MS, console);
await outbox.start();
const app = await buildAcademicApp({
  env,
  repository,
  snapshots: new ApplyAcademicSnapshotService(repository),
  studentSnapshots: new ApplyStudentAcademicSnapshotService(repository),
  sharedClasses: new SharedClassService(sharedClassRepository),
  ready: async () => {
    const database = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return { database, rabbitmq: outbox.isReady() };
  },
});
app.addHook('onClose', async () => {
  await outbox.stop();
  await prisma.$disconnect();
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  installShutdownHandlers();
} catch (error) {
  app.log.fatal(error, 'No se pudo iniciar Academic Service.');
  process.exitCode = 1;
}

function installShutdownHandlers(): void {
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Cerrando Academic Service.');
    await app.close();
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
