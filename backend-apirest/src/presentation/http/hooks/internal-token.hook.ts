import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export function buildInternalTokenHook(expectedToken: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authorization = request.headers.authorization;
    const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
    const headerToken = request.headers['x-internal-api-token'];
    const token = bearerToken ?? (Array.isArray(headerToken) ? headerToken[0] : headerToken);

    if (!token || !tokenMatches(token, expectedToken)) {
      return reply.code(401).send({
        error: 'INTERNAL_UNAUTHORIZED',
        message: 'Token interno requerido.',
      });
    }
  };
}

function tokenMatches(candidate: string, expected: string): boolean {
  const actualBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
