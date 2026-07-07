import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CoordinatorAuthService } from '../../../application/services/coordinator-auth.service.js';

export const COORDINATOR_COOKIE = 'coord_session';

export function buildCoordinatorAuthHook(authService: CoordinatorAuthService, options: { write?: boolean } = {}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await authService.authenticate(request.cookies[COORDINATOR_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'COORDINATOR_UNAUTHORIZED', message: 'Sesion de coordinacion requerida.' });
    if (options.write && user.role !== 'COORDINATOR') {
      return reply.code(403).send({ error: 'COORDINATOR_FORBIDDEN', message: 'Permiso de escritura requerido.' });
    }
    request.coordinator = user;
  };
}
