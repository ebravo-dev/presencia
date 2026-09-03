import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UatStudentService } from '../../../application/services/uat-student.service.js';
import { parsePayload, selectStudentCareerSchema, sessionParamsSchema, studentCredentialsSchema } from '../schemas/uat.schemas.js';
import { env } from '../../../config/env.js';

export class StudentSessionController {
  constructor(private readonly uatStudentService: UatStudentService) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const credentials = parsePayload(studentCredentialsSchema, request.body);
    const session = await this.uatStudentService.createSession(credentials, { correlationId: request.id });
    const response = await this.uatStudentService.toSessionResponse(session);

    return reply.code(201).send({
      ...response,
      demoMode: env.PRESENCIA_DEBUG_MODE || session.source === 'APP_REVIEW',
    });
  };

  delete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = parsePayload(sessionParamsSchema, request.params);
    const deleted = await this.uatStudentService.deleteSession(sessionId);

    return reply.send({
      deleted,
      sessionId,
    });
  };

  careers = async (request: FastifyRequest) => {
    return this.uatStudentService.getCareersBySession(request.uatStudentSession.id);
  };

  selectCareer = async (request: FastifyRequest) => {
    const { idPlanEstudio } = parsePayload(selectStudentCareerSchema, request.body);
    return this.uatStudentService.selectCareerBySession(request.uatStudentSession.id, idPlanEstudio);
  };

  schedule = async (request: FastifyRequest) => {
    return this.uatStudentService.getScheduleBySession(request.uatStudentSession.id, { correlationId: request.id });
  };

  partialGrades = async (request: FastifyRequest) => {
    return this.uatStudentService.getPartialGradesBySession(request.uatStudentSession.id);
  };

  finalGrades = async (request: FastifyRequest) => {
    return this.uatStudentService.getFinalGradesBySession(request.uatStudentSession.id);
  };
}
