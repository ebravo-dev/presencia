import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CoordinationService } from '../../../application/services/coordination.service.js';
import type { WeeklyAttendanceReportService } from '../../../application/services/weekly-attendance-report.service.js';
import type { SharedClassService, SharedClassInput } from '../../../application/services/shared-class.service.js';
import type { AttendanceBackendClient } from '../../../infrastructure/http/client/attendance-backend.client.js';
import {
  parseCoordinationPayload,
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
  ) {}

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

  weeklyReport = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseCoordinationPayload(weeklyReportQuerySchema, request.query);
    return reply.send(await this.weeklyAttendanceReport.getReport(query.teacherId, query.weekStart));
  };

  beacons = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.attendanceBackendClient.listBeacons());
  };

  infrastructureSummary = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.attendanceBackendClient.getInfrastructureSummary());
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
    return reply.send(await this.attendanceBackendClient.listStudentDeviceBindings({ q: request.query.q }));
  };

  deleteStudentDeviceBinding = async (request: FastifyRequest<{ Params: { matricula: string } }>, reply: FastifyReply) => {
    await this.attendanceBackendClient.deleteStudentDeviceBinding(request.params.matricula);
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
