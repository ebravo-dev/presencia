import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AcademicServiceClient } from '../../../infrastructure/http/client/academic-service.client.js';
import { parsePayload, sharedClassesQuerySchema } from '../schemas/uat.schemas.js';

export class SharedClassController {
  constructor(private readonly academicService: AcademicServiceClient) {}

  forAuthenticatedTeacher = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.uatSession.source === 'APP_REVIEW') {
      return reply.send({ data: [] });
    }
    const query = parsePayload(sharedClassesQuerySchema, request.query);
    return reply.send(await this.academicService.listSharedClassesForTeacher({
      identity: request.uatSession.username,
      ...(query.year !== undefined && query.term !== undefined
        ? { year: query.year, term: query.term }
        : {}),
    }));
  };
}
