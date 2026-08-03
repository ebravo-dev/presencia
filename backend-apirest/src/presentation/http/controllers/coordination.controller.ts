import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CoordinationService } from '../../../application/services/coordination.service.js';
import type { WeeklyAttendanceReportService } from '../../../application/services/weekly-attendance-report.service.js';
import type { SharedClassService, SharedClassInput } from '../../../application/services/shared-class.service.js';
import type { AttendanceBackendClient } from '../../../infrastructure/http/client/attendance-backend.client.js';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import type { CoordinationQueryClient } from '../../../infrastructure/http/client/coordination-query.client.js';
import { ApiError } from '../../../errors/api-error.js';
import {
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
    private readonly coordinationService: CoordinationService,
    private readonly weeklyAttendanceReport: WeeklyAttendanceReportService,
    private readonly attendanceBackendClient: AttendanceBackendClient,
    private readonly sharedClassService: SharedClassService,
    private readonly attendanceServiceCommands?: AttendanceServiceCommandClient,
    private readonly coordinationQuery?: CoordinationQueryClient,
  ) {}

  overview = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (this.coordinationQuery) return reply.code(200).send(await this.coordinationQuery.overview());
    return reply.code(200).send(await this.coordinationService.getOverview());
  };

  coordinations = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (this.coordinationQuery) return reply.code(200).send(await this.coordinationQuery.coordinations());
    return reply.code(200).send(await this.coordinationService.listCoordinations());
  };

  teachers = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseCoordinationPayload(teacherListQuerySchema, request.query);
    if (this.coordinationQuery) return reply.code(200).send(await this.coordinationQuery.teachers(query));
    return reply.code(200).send(await this.coordinationService.listTeachers(query));
  };

  teacherAssignments = async (request: FastifyRequest, reply: FastifyReply) => {
    const { teacherId } = parseCoordinationPayload(teacherParamsSchema, request.params);
    if (this.coordinationQuery) return reply.code(200).send(await this.coordinationQuery.teacherAssignments(teacherId));
    return reply.code(200).send(await this.coordinationService.getTeacherAssignments(teacherId));
  };

  weeklyReport = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseCoordinationPayload(weeklyReportQuerySchema, request.query);
    if (this.coordinationQuery) return reply.send(await this.coordinationQuery.weeklyReport(query));
    return reply.send(await this.weeklyAttendanceReport.getReport(query.teacherId, query.weekStart));
  };

  rangeReport = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseCoordinationPayload(rangeReportQuerySchema, request.query);
    if (this.coordinationQuery) return reply.send(await this.coordinationQuery.rangeReport(query));
    return reply.send(await this.weeklyAttendanceReport.getRangeReport(query.teacherId, query.startDate, query.endDate));
  };

  beacons = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.attendanceBackendClient.listBeacons());
  };

  infrastructureSummary = async (_request: FastifyRequest, reply: FastifyReply) => {
    const legacy = await this.attendanceBackendClient.getInfrastructureSummary() as InfrastructureSummaryResponse;
    if (!this.attendanceServiceCommands) return reply.send(legacy);
    const bindings = await this.attendanceServiceCommands.bindingInfrastructureSummary();
    return reply.send({
      ...legacy,
      data: {
        ...legacy.data,
        counts: { ...legacy.data.counts, studentDeviceBindings: bindings.data.count },
        recentBindings: bindings.data.recentBindings,
      },
      meta: { generatedAt: new Date().toISOString() },
    });
  };

  createBeacon = async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(201).send(await this.attendanceBackendClient.createBeacon(request.body as { classroom: string; uuid: string }));
  };

  updateBeacon = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    return reply.send(await this.attendanceBackendClient.updateBeacon(request.params.id, request.body as Partial<{ classroom: string; uuid: string }>));
  };

  deleteBeacon = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await this.attendanceBackendClient.deleteBeacon(request.params.id);
    return reply.code(204).send();
  };

  studentDeviceBindings = async (request: FastifyRequest<{ Querystring: { q?: string } }>, reply: FastifyReply) => {
    if (this.attendanceServiceCommands) {
      return reply.send(await this.attendanceServiceCommands.listStudentDeviceBindings({ q: request.query.q }));
    }
    return reply.send(await this.attendanceBackendClient.listStudentDeviceBindings({ q: request.query.q }));
  };

  deleteStudentDeviceBinding = async (request: FastifyRequest<{ Params: { matricula: string } }>, reply: FastifyReply) => {
    const coordinator = request.coordinator;
    if (!coordinator) return reply.code(401).send({ error: 'COORDINATOR_UNAUTHORIZED' });
    if (this.attendanceServiceCommands) {
      await this.attendanceServiceCommands.unbindStudentDevice({
        matricula: request.params.matricula,
        actorIdentityId: coordinator.id,
        actorRole: 'COORDINATOR',
        reason: 'Desvinculación solicitada desde el dashboard de coordinación.',
        correlationId: request.id,
      });
    }
    try {
      await this.attendanceBackendClient.deleteStudentDeviceBinding(request.params.matricula);
    } catch (error) {
      if (!(this.attendanceServiceCommands && error instanceof ApiError && error.statusCode === 404)) throw error;
    }
    return reply.code(204).send();
  };

  sharedClassOptions = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.sharedClassService.listOptions());
  };

  sharedClasses = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.sharedClassService.list());
  };

  createSharedClass = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = parseCoordinationPayload(sharedClassBodySchema, request.body) as SharedClassInput;
    return reply.code(201).send(await this.sharedClassService.create(input));
  };

  updateSharedClass = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseCoordinationPayload(sharedClassParamsSchema, request.params);
    const input = parseCoordinationPayload(sharedClassUpdateBodySchema, request.body) as Partial<SharedClassInput>;
    return reply.send(await this.sharedClassService.update(id, input));
  };

  deleteSharedClass = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseCoordinationPayload(sharedClassParamsSchema, request.params);
    await this.sharedClassService.delete(id);
    return reply.code(204).send();
  };

  substitutionOptions = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.attendanceBackendClient.getSubstitutionOptions());
  };

  substituteAssignments = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.attendanceBackendClient.listSubstituteAssignments());
  };

  createSubstituteAssignment = async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(201).send(await this.attendanceBackendClient.createSubstituteAssignment(request.body as {
      groupId: string;
      substituteProfessorId: string;
      startsAt?: string | null;
      endsAt?: string | null;
      active?: boolean;
      notes?: string | null;
    }));
  };

  updateSubstituteAssignment = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    return reply.send(await this.attendanceBackendClient.updateSubstituteAssignment(request.params.id, request.body as Partial<{
      groupId: string;
      substituteProfessorId: string;
      startsAt: string | null;
      endsAt: string | null;
      active: boolean;
      notes: string | null;
    }>));
  };

  deleteSubstituteAssignment = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await this.attendanceBackendClient.deleteSubstituteAssignment(request.params.id);
    return reply.code(204).send();
  };
}

interface InfrastructureSummaryResponse {
  data: {
    counts: { beacons: number; studentDeviceBindings: number; studentBleAttendances: number; activeSubstitutions: number };
    recentBindings: unknown[]; recentBeacons: unknown[]; recentSubstitutions: unknown[];
  };
  meta: { generatedAt: string };
}
