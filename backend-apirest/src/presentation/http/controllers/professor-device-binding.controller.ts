import type { FastifyRequest } from 'fastify';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import { ApiError } from '../../../errors/api-error.js';
import {
  parsePayload,
  professorBeaconResolveSchema,
  professorDeviceBindingCreateSchema,
  professorDeviceBindingResolveSchema,
} from '../schemas/uat.schemas.js';

export class ProfessorDeviceBindingController {
  constructor(private readonly attendance: AttendanceServiceCommandClient | undefined) {}

  listBeacons = async () => {
    if (!this.attendance) {
      throw new ApiError(503, 'ATTENDANCE_SERVICE_REQUIRED', 'Attendance Service no está disponible.');
    }
    return this.attendance.listClassroomBeacons();
  };

  resolve = async (request: FastifyRequest) => {
    if (!this.attendance) {
      throw new ApiError(503, 'ATTENDANCE_SERVICE_REQUIRED', 'Attendance Service no está disponible.');
    }
    const body = parsePayload(professorDeviceBindingResolveSchema, request.body);
    return this.attendance.resolveStudentDeviceBindings({
      professorExternalId: professorExternalId(request), matriculas: body.matriculas,
    });
  };

  bind = async (request: FastifyRequest) => {
    if (!this.attendance) {
      throw new ApiError(503, 'ATTENDANCE_SERVICE_REQUIRED', 'Attendance Service no está disponible.');
    }
    const body = parsePayload(professorDeviceBindingCreateSchema, request.body);
    const professorId = professorExternalId(request);
    return this.attendance.bindStudentDeviceByProfessor({
      externalGroupId: body.externalGroupId,
      professorExternalId: professorId,
      matricula: body.matricula.trim().toUpperCase(),
      attendanceUuid: body.attendanceUuid.trim().toLowerCase(),
      deviceBindingId: null,
      platform: 'ios',
      deviceInfo: 'Beacon iOS registrado manualmente por el profesor desde su lista de alumnos.',
      actorIdentityId: request.uatSession.identitySession?.identityId ?? `professor:${professorId}`,
      actorRole: 'PROFESSOR',
      reason: 'Alta manual de beacon iOS por el profesor responsable del grupo.',
      correlationId: request.id,
    });
  };

  resolveBeacons = async (request: FastifyRequest) => {
    if (!this.attendance) {
      throw new ApiError(503, 'ATTENDANCE_SERVICE_REQUIRED', 'Attendance Service no está disponible.');
    }
    const body = parsePayload(professorBeaconResolveSchema, request.body);
    return this.attendance.resolveClassroomBeacons({
      professorExternalId: professorExternalId(request),
      professorEmail: request.uatSession.username,
      classrooms: body.classrooms,
    });
  };
}

function professorExternalId(request: FastifyRequest): string {
  return request.uatSession.login.parametros?.Id_Plantilla_AdmonUAT?.toString().trim()
    || request.uatSession.login.parametros?.Cve_Usuario_AdmonUAT?.toString().trim()
    || request.uatSession.username;
}
