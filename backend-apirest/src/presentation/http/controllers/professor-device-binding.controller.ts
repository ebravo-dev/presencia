import type { FastifyRequest } from 'fastify';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import { ApiError } from '../../../errors/api-error.js';
import { parsePayload, professorBeaconResolveSchema, professorDeviceBindingResolveSchema } from '../schemas/uat.schemas.js';

export class ProfessorDeviceBindingController {
  constructor(private readonly attendance: AttendanceServiceCommandClient | undefined) {}

  resolve = async (request: FastifyRequest) => {
    if (!this.attendance) {
      throw new ApiError(503, 'ATTENDANCE_SERVICE_REQUIRED', 'Attendance Service no está disponible.');
    }
    const body = parsePayload(professorDeviceBindingResolveSchema, request.body);
    return this.attendance.resolveStudentDeviceBindings({
      professorExternalId: professorExternalId(request), matriculas: body.matriculas,
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
