import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CoordinationService } from '../../../application/services/coordination.service.js';
import { parseCoordinationPayload, teacherListQuerySchema, teacherParamsSchema } from '../schemas/coordination.schemas.js';

export class CoordinationController {
  constructor(private readonly coordinationService: CoordinationService) {}

  overview = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(await this.coordinationService.getOverview());
  };

  coordinations = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(await this.coordinationService.listCoordinations());
  };

  teachers = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseCoordinationPayload(teacherListQuerySchema, request.query);
    return reply.code(200).send(await this.coordinationService.listTeachers(query));
  };

  teacherAssignments = async (request: FastifyRequest, reply: FastifyReply) => {
    const { teacherId } = parseCoordinationPayload(teacherParamsSchema, request.params);
    return reply.code(200).send(await this.coordinationService.getTeacherAssignments(teacherId));
  };
}
