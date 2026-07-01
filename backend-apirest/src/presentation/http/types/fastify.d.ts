import type { StoredUatSession } from '../../../domain/types/uat.interfaces.js';

declare module 'fastify' {
  interface FastifyRequest {
    uatSession: StoredUatSession;
  }
}

export {};
