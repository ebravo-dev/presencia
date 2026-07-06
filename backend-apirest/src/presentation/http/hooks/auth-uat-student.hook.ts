import type { FastifyRequest } from 'fastify';
import type { UatStudentService } from '../../../application/services/uat-student.service.js';

export function buildAuthUatStudentHook(uatStudentService: UatStudentService) {
  return async function authUatStudentHook(request: FastifyRequest): Promise<void> {
    const rawHeader = request.headers['x-uat-student-session-id'];
    const sessionId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    request.uatStudentSession = await uatStudentService.getSessionOrThrow(sessionId);
  };
}
