import { CoordinationReportService } from './application/coordination-report.service.js';
import { ProjectionReconciler } from './application/projection-reconciler.js';
import { PrismaClient } from './generated/prisma/index.js';
import { loadCoordinationQueryEnv } from './infrastructure/config.js';
import { PrismaCoordinationQueryRepository } from './infrastructure/prisma-coordination-query.repository.js';
import { ProjectionEventConsumer } from './infrastructure/projection-event-consumer.js';
import { ProjectionSourceClient } from './infrastructure/projection-source.client.js';
import { buildCoordinationQueryApp } from './presentation/app.js';

const env = loadCoordinationQueryEnv();
const prisma = new PrismaClient();
await prisma.$connect();
const repository = new PrismaCoordinationQueryRepository(prisma);
const consumer = new ProjectionEventConsumer(repository, env.RABBITMQ_URL, console);
await consumer.start();
const reconciler = new ProjectionReconciler(
  repository,
  new ProjectionSourceClient(env.ACADEMIC_SERVICE_URL, env.ATTENDANCE_SERVICE_URL, env.INTERNAL_API_TOKEN),
  env.RECONCILE_INTERVAL_MS,
  console,
);
await reconciler.start();
const app = await buildCoordinationQueryApp({
  env,
  repository,
  reports: new CoordinationReportService(repository),
  ready: async () => {
    const database = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return database && consumer.isReady() && reconciler.isReady();
  },
});
app.addHook('onClose', async () => { reconciler.stop(); await consumer.stop(); await prisma.$disconnect(); });

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.fatal(error, 'Could not start Coordination Query Service.');
  process.exitCode = 1;
}
