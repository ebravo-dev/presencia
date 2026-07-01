import type { FastifyRequest } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';

export function buildAuthUatHook(uatService: UatService) {
  return async function authUatHook(request: FastifyRequest): Promise<void> {
    const rawHeader = request.headers['x-uat-session-id'];
    const sessionId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    request.uatSession = await uatService.getSessionOrThrow(sessionId);
  };
}
