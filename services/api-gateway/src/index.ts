import { buildGateway } from './app.js';
import { loadGatewayEnv } from './config.js';

const env = loadGatewayEnv();
const app = await buildGateway({ env });

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  installShutdownHandlers();
} catch (error) {
  app.log.fatal(error, 'No se pudo iniciar el API Gateway.');
  process.exitCode = 1;
}

function installShutdownHandlers(): void {
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Cerrando API Gateway.');
    await app.close();
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
