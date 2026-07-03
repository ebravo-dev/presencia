import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CoordinatorAuthService } from '../../../application/services/coordinator-auth.service.js';

export const COORDINATOR_COOKIE = 'coord_session';

export function buildCoordinatorAuthHook(authService: CoordinatorAuthService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await authService.authenticate(request.cookies[COORDINATOR_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'COORDINATOR_UNAUTHORIZED', message: 'Sesion de coordinacion requerida.' });
    request.coordinator = user;
  };
}
