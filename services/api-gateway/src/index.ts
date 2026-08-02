import { buildGateway } from './app.js';
import { loadGatewayEnv } from './config.js';

const env = loadGatewayEnv();
const app = await buildGateway({ env });

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.fatal(error, 'No se pudo iniciar el API Gateway.');
  process.exitCode = 1;
}
