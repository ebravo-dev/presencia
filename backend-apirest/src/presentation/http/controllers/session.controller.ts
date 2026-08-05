import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import type { IDomainEventBus } from '../../../domain/events/domain-event-bus.js';
import { createTeacherAuthenticatedEvent } from '../../../domain/events/teacher-authenticated.event.js';
import { credentialsSchema, parsePayload, sessionParamsSchema } from '../schemas/uat.schemas.js';
import { env } from '../../../config/env.js';

interface AttendanceSettingsSource {
  attendanceSettings(): Promise<{
    data: {
      teacherAttendanceToleranceMinutes: number;
      updatedAt: string | null;
    };
  }>;
}

export class SessionController {
  constructor(
    private readonly uatService: UatService,
    private readonly eventBus: IDomainEventBus,
    private readonly attendanceSettings?: AttendanceSettingsSource,
  ) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const credentials = parsePayload(credentialsSchema, request.body);
    const session = await this.uatService.createSession(credentials, { correlationId: request.id });
    const response = await this.uatService.toSessionResponse(session);

    try {
      await this.eventBus.publish(
        createTeacherAuthenticatedEvent({
          sessionId: session.id,
          username: credentials.username,
          correlationId: request.id,
          causationId: request.id,
          loginParameters: session.login.parametros,
        }),
      );
      if (env.PRESENCIA_DEBUG_MODE) {
        request.log.info({ sessionId: session.id }, 'Modo demo activo: cosecha encolada desde el portal simulado.');
      }
    } catch (error) {
      request.log.error({ err: error, sessionId: session.id }, 'No fue posible despachar la cosecha post-autenticacion.');
    }

    return reply.code(201).send({
      ...response,
      demoMode: env.PRESENCIA_DEBUG_MODE,
      demoCapabilities: { simulateRoomBeacon: env.PRESENCIA_DEBUG_MODE },
    });
  };

  sync = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.uatSession;

    await this.eventBus.publish(
      createTeacherAuthenticatedEvent({
        sessionId: session.id,
        username: session.username,
        correlationId: request.id,
        causationId: request.id,
        loginParameters: session.login.parametros,
      }),
    );

    return reply.code(202).send({
      accepted: true,
      sessionId: session.id,
      message: 'Sincronizacion academica encolada.',
    });
  };

  settings = async (request: FastifyRequest, reply: FastifyReply) => {
    let data = {
      teacherAttendanceToleranceMinutes: 10,
      updatedAt: null as string | null,
    };
    try {
      if (this.attendanceSettings) {
        data = (await this.attendanceSettings.attendanceSettings()).data;
      }
    } catch (error) {
      request.log.warn(
        { err: error },
        'No fue posible consultar la configuracion de asistencia; se usara el valor inicial seguro.',
      );
    }
    return reply.send({
      data,
      meta: { generatedAt: new Date().toISOString() },
    });
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
