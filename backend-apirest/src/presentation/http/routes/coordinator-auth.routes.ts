import type { FastifyPluginAsync } from 'fastify';
import type { CoordinatorAuthService } from '../../../application/services/coordinator-auth.service.js';
import { CoordinatorAuthController } from '../controllers/coordinator-auth.controller.js';
import { buildCoordinatorAuthHook } from '../hooks/coordinator-auth.hook.js';

export const coordinatorAuthRoutes: FastifyPluginAsync<{ authService: CoordinatorAuthService }> = async (fastify, { authService }) => {
  const controller = new CoordinatorAuthController(authService);
  const requireCoordinator = buildCoordinatorAuthHook(authService);
  fastify.post('/api/coordinacion/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, controller.login);
  fastify.get('/api/coordinacion/auth/me', { preHandler: requireCoordinator }, controller.me);
  fastify.post('/api/coordinacion/auth/logout', { preHandler: requireCoordinator }, controller.logout);
};
