import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import type { AcademicServiceClient } from '../../../infrastructure/http/client/academic-service.client.js';
import type { CoordinationQueryClient } from '../../../infrastructure/http/client/coordination-query.client.js';
import { ApiError } from '../../../errors/api-error.js';
import {
  attendanceSettingsSchema,
  parseCoordinationPayload,
  rangeReportQuerySchema,
  sharedClassBodySchema,
  sharedClassParamsSchema,
  sharedClassUpdateBodySchema,
  teacherListQuerySchema,
  teacherParamsSchema,
  weeklyReportQuerySchema,
} from '../schemas/coordination.schemas.js';

export class CoordinationController {
  constructor(
    private readonly academicService: AcademicServiceClient,
    private readonly attendanceServiceCommands: AttendanceServiceCommandClient,
    private readonly coordinationQuery: CoordinationQueryClient,
  ) {}

  overview = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(await this.coordinationQuery.overview());
  };

  coordinations = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(await this.coordinationQuery.coordinations());
  };

  teachers = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseCoordinationPayload(teacherListQuerySchema, request.query);
    return reply.code(200).send(await this.coordinationQuery.teachers(query));
  };

  teacherAssignments = async (request: FastifyRequest, reply: FastifyReply) => {
    const { teacherId } = parseCoordinationPayload(teacherParamsSchema, request.params);
    return reply.code(200).send(await this.coordinationQuery.teacherAssignments(teacherId));
  };

  weeklyReport = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseCoordinationPayload(weeklyReportQuerySchema, request.query);
    return reply.send(await this.coordinationQuery.weeklyReport(query));
  };

  rangeReport = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseCoordinationPayload(rangeReportQuerySchema, request.query);
    return reply.send(await this.coordinationQuery.rangeReport(query));
  };

  attendanceSettings = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.attendanceServiceCommands.attendanceSettings());
  };

  updateAttendanceSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = parseCoordinationPayload(attendanceSettingsSchema, request.body);
    const coordinator = requireCoordinator(request);
    return reply.send(await this.attendanceServiceCommands.updateAttendanceSettings({
      ...input,
      actorIdentityId: coordinator.id,
      actorRole: 'COORDINATOR',
    }));
  };

  beacons = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.attendanceServiceCommands.listClassroomBeacons());
  };

  infrastructureSummary = async (_request: FastifyRequest, reply: FastifyReply) => {
    const [attendance, sharedClasses] = await Promise.all([
      this.attendanceServiceCommands.infrastructureSummary(),
      this.academicService.listSharedClasses(),
    ]);
    const activeSharedClasses = sharedClasses.data.filter(({ active }) => active);
    return reply.send({
      data: {
        counts: {
          ...attendance.data.counts,
          activeSubstitutions: activeSharedClasses.length,
        },
        recentBindings: attendance.data.recentBindings,
        recentBeacons: attendance.data.recentBeacons,
        recentSubstitutions: activeSharedClasses
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
          .slice(0, 6)
          .map((assignment) => ({
            id: assignment.id,
            group: {
              name: assignment.sourceAssignment.subject.name,
              groupLetter: assignment.sourceAssignment.groupCode,
              classroom: assignment.sourceAssignment.classroom,
            },
            primaryProfessor: { name: assignment.sourceAssignment.teacher.name },
            substituteProfessor: { name: assignment.assignedTeacher.name },
          })),
      },
      meta: { generatedAt: attendance.meta.generatedAt },
    });
  };

  createBeacon = async (request: FastifyRequest, reply: FastifyReply) => {
    const coordinator = requireCoordinator(request);
    return reply.code(201).send(await this.attendanceServiceCommands.createClassroomBeacon({
      ...(request.body as { classroom: string; uuid: string }), actorIdentityId: coordinator.id,
      actorRole: 'COORDINATOR', reason: 'Alta de beacon desde coordinación.', correlationId: request.id,
    }));
  };

  updateBeacon = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const coordinator = requireCoordinator(request);
    return reply.send(await this.attendanceServiceCommands.updateClassroomBeacon(request.params.id, {
      ...(request.body as Partial<{ classroom: string; uuid: string }>), actorIdentityId: coordinator.id,
      actorRole: 'COORDINATOR', reason: 'Actualización de beacon desde coordinación.', correlationId: request.id,
    }));
  };

  deleteBeacon = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const coordinator = requireCoordinator(request);
    await this.attendanceServiceCommands.deleteClassroomBeacon(request.params.id, {
      actorIdentityId: coordinator.id, actorRole: 'COORDINATOR',
      reason: 'Baja de beacon desde coordinación.', correlationId: request.id,
    });
    return reply.code(204).send();
  };

  studentDeviceBindings = async (request: FastifyRequest<{ Querystring: { q?: string } }>, reply: FastifyReply) => {
    return reply.send(await this.attendanceServiceCommands.listStudentDeviceBindings({ q: request.query.q }));
  };

  deleteStudentDeviceBinding = async (request: FastifyRequest<{ Params: { matricula: string } }>, reply: FastifyReply) => {
    const coordinator = request.coordinator;
    if (!coordinator) return reply.code(401).send({ error: 'COORDINATOR_UNAUTHORIZED' });
    await this.attendanceServiceCommands.unbindStudentDevice({
      matricula: request.params.matricula,
      actorIdentityId: coordinator.id,
      actorRole: 'COORDINATOR',
      reason: 'Desvinculación solicitada desde el dashboard de coordinación.',
      correlationId: request.id,
    });
    return reply.code(204).send();
  };

  sharedClassOptions = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.academicService.listSharedClassOptions());
  };

  sharedClasses = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.academicService.listSharedClasses());
  };

  createSharedClass = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = parseCoordinationPayload(sharedClassBodySchema, request.body);
    const coordinator = requireCoordinator(request);
    return reply.code(201).send(await this.academicService.createSharedClass({
      ...input,
      actorIdentityId: coordinator.id,
      actorRole: 'COORDINATOR',
      reason: 'Alta de clase compartida desde coordinación.',
      correlationId: request.id,
    }));
  };

  updateSharedClass = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseCoordinationPayload(sharedClassParamsSchema, request.params);
    const input = parseCoordinationPayload(sharedClassUpdateBodySchema, request.body);
    const coordinator = requireCoordinator(request);
    return reply.send(await this.academicService.updateSharedClass(id, {
      ...input,
      actorIdentityId: coordinator.id,
      actorRole: 'COORDINATOR',
      reason: 'Actualización de clase compartida desde coordinación.',
      correlationId: request.id,
    }));
  };

  deleteSharedClass = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseCoordinationPayload(sharedClassParamsSchema, request.params);
    const coordinator = requireCoordinator(request);
    await this.academicService.deleteSharedClass(id, {
      actorIdentityId: coordinator.id,
      actorRole: 'COORDINATOR',
      reason: 'Baja de clase compartida desde coordinación.',
      correlationId: request.id,
    });
    return reply.code(204).send();
  };

}

function requireCoordinator(request: FastifyRequest) {
  if (!request.coordinator) throw new ApiError(401, 'COORDINATOR_UNAUTHORIZED', 'Sesión de coordinación requerida.');
  return request.coordinator;
}
