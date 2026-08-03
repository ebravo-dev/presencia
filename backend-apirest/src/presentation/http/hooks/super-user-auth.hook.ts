import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SuperUserAuthService } from '../../../application/services/super-user-auth.service.js';

export const SUPER_USER_COOKIE = 'super_user_session';

export function buildSuperUserAuthHook(authService: SuperUserAuthService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await authService.authenticate(request.cookies[SUPER_USER_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'SUPER_USER_UNAUTHORIZED', message: 'Sesión de super usuario requerida.' });
    request.superUser = user;
  };
}
