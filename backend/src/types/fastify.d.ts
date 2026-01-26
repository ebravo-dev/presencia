import '@fastify/jwt';
import { FastifyInstance, FastifyRequest } from 'fastify';

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: any) => Promise<void>;
    }
}

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: {
            professorId: string;
            email: string;
        };
        user: {
            professorId: string;
            email: string;
        };
    }
}
