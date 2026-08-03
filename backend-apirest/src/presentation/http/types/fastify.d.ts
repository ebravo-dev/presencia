import type { StoredUatSession, StoredUatStudentSession } from '../../../domain/types/uat.interfaces.js';
import type { CoordinatorIdentity } from '../../../application/services/coordinator-auth.service.js';
import type { SuperUserIdentity } from '../../../application/services/super-user-auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    uatSession: StoredUatSession;
    uatStudentSession: StoredUatStudentSession;
    coordinator?: CoordinatorIdentity;
    superUser?: SuperUserIdentity;
  }
}

export {};
