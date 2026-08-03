import { CaptureAttendanceService } from './application/capture-attendance.service.js';
import { DeviceBindingService } from './application/device-binding.service.js';
import { PrismaClient } from './generated/prisma/index.js';
import { loadAttendanceEnv } from './infrastructure/config.js';
import { PrismaAttendanceRepository } from './infrastructure/prisma-attendance.repository.js';
import { AttendanceEventBus } from './infrastructure/attendance-event-bus.js';
import { buildAttendanceApp } from './presentation/app.js';

const env = loadAttendanceEnv();
const prisma = new PrismaClient();
await prisma.$connect();
const repository = new PrismaAttendanceRepository(prisma);
const eventBus = new AttendanceEventBus(prisma, repository, env.RABBITMQ_URL, env.OUTBOX_POLL_INTERVAL_MS, console);
await eventBus.start();
const app = await buildAttendanceApp({
  env,
  repository,
  captures: new CaptureAttendanceService(repository),
  bindings: new DeviceBindingService(repository),
  ready: async () => {
    const database = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return { database, rabbitmq: eventBus.isReady() };
  },
});
app.addHook('onClose', async () => {
  await eventBus.stop();
  await prisma.$disconnect();
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  installShutdownHandlers();
} catch (error) {
  app.log.fatal(error, 'No se pudo iniciar Attendance Service.');
  process.exitCode = 1;
}

function installShutdownHandlers(): void {
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Cerrando Attendance Service.');
    await app.close();
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
