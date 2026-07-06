import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SharedClassService } from '../../../application/services/shared-class.service.js';
import { parsePayload, sharedClassesQuerySchema } from '../schemas/uat.schemas.js';

export class SharedClassController {
  constructor(private readonly service: SharedClassService) {}

  forAuthenticatedTeacher = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parsePayload(sharedClassesQuerySchema, request.query);
    const cycle = query.year !== undefined && query.term !== undefined
      ? { year: query.year, term: query.term }
      : undefined;
    return reply.send(await this.service.listForAuthenticatedTeacher(request.uatSession.username, cycle));
  };
}
