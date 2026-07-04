import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import type { IDomainEventBus } from '../../../domain/events/domain-event-bus.js';
import { createTeacherAuthenticatedEvent } from '../../../domain/events/teacher-authenticated.event.js';
import { credentialsSchema, parsePayload, sessionParamsSchema } from '../schemas/uat.schemas.js';

export class SessionController {
  constructor(
    private readonly uatService: UatService,
    private readonly eventBus: IDomainEventBus,
  ) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const credentials = parsePayload(credentialsSchema, request.body);
    const session = await this.uatService.createSession(credentials);
    const response = await this.uatService.toSessionResponse(session);

    try {
      this.eventBus.publish(
        createTeacherAuthenticatedEvent({
          sessionId: session.id,
          username: credentials.username,
          loginParameters: session.login.parametros,
        }),
      );
    } catch (error) {
      request.log.error({ err: error, sessionId: session.id }, 'No fue posible despachar la cosecha post-autenticacion.');
    }

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
