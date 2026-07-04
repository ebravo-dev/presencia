import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SharedClassService } from '../../../application/services/shared-class.service.js';

export class SharedClassController {
  constructor(private readonly service: SharedClassService) {}

  forAuthenticatedTeacher = async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.service.listForAuthenticatedTeacher(request.uatSession.username));
  };
}
