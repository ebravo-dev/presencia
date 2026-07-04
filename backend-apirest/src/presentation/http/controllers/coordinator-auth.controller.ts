import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CoordinatorAuthService } from '../../../application/services/coordinator-auth.service.js';
import { env } from '../../../config/env.js';
import { COORDINATOR_COOKIE } from '../hooks/coordinator-auth.hook.js';
import { coordinatorLoginSchema } from '../schemas/coordinator-auth.schemas.js';
import { parseCoordinationPayload } from '../schemas/coordination.schemas.js';

export class CoordinatorAuthController {
  constructor(private readonly authService: CoordinatorAuthService) {}

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = parseCoordinationPayload(coordinatorLoginSchema, request.body);
    try {
      const result = await this.authService.login(input.email, input.password);
      reply.setCookie(COORDINATOR_COOKIE, result.token, cookieOptions(result.expiresAt));
      return reply.send({ data: { user: result.user, expiresAt: result.expiresAt.toISOString() } });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_COORDINATOR_CREDENTIALS') {
        return reply.code(401).send({ error: 'INVALID_COORDINATOR_CREDENTIALS', message: 'Credenciales invalidas.' });
      }
      throw error;
    }
  };

  me = async (request: FastifyRequest, reply: FastifyReply) => reply.send({ data: { user: request.coordinator } });

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.authService.logout(request.cookies[COORDINATOR_COOKIE]);
    reply.clearCookie(COORDINATOR_COOKIE, { path: '/api/coordinacion', sameSite: 'strict' });
    return reply.code(204).send();
  };
}

function cookieOptions(expires: Date) {
  return {
    path: '/api/coordinacion', httpOnly: true, sameSite: 'strict' as const,
    secure: env.COORDINATION_COOKIE_SECURE ?? env.NODE_ENV === 'production', expires,
  };
}
