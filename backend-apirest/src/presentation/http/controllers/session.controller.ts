import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import { credentialsSchema, parsePayload, sessionParamsSchema } from '../schemas/uat.schemas.js';

export class SessionController {
  constructor(private readonly uatService: UatService) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const credentials = parsePayload(credentialsSchema, request.body);
    const session = await this.uatService.createSession(credentials);
    const response = await this.uatService.toSessionResponse(session);

    return reply.code(201).send(response);
  };

  delete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = parsePayload(sessionParamsSchema, request.params);
    const deleted = await this.uatService.deleteSession(sessionId);

    return reply.send({
      deleted,
      sessionId,
    });
  };
}
