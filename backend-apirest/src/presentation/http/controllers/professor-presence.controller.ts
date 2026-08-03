import type { FastifyRequest } from 'fastify';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import { ApiError } from '../../../errors/api-error.js';
import {
  parsePayload, professorPresenceEntrySchema, professorPresenceExitSchema, studentPresenceDetectionsSchema,
} from '../schemas/uat.schemas.js';

export class ProfessorPresenceController {
  constructor(private readonly attendance: AttendanceServiceCommandClient | undefined) {}

  entry = async (request: FastifyRequest) => {
    const attendance = this.requiredAttendance();
    const body = parsePayload(professorPresenceEntrySchema, request.body);
    return attendance.observeProfessorEntry({
      ...body, professorExternalId: professorExternalId(request), trustedGroupAuthorization: false,
      correlationId: request.id,
    });
  };

  exit = async (request: FastifyRequest) => {
    const attendance = this.requiredAttendance();
    const body = parsePayload(professorPresenceExitSchema, request.body);
    return attendance.observeProfessorExit({
      ...body, professorExternalId: professorExternalId(request), trustedGroupAuthorization: false,
      correlationId: request.id,
    });
  };

  studentDetections = async (request: FastifyRequest) => {
    const attendance = this.requiredAttendance();
    const body = parsePayload(studentPresenceDetectionsSchema, request.body);
    return attendance.observeStudentPresence({
      ...body, professorExternalId: professorExternalId(request), trustedGroupAuthorization: false,
      correlationId: request.id,
    });
  };

  private requiredAttendance(): AttendanceServiceCommandClient {
    if (!this.attendance) throw new ApiError(503, 'ATTENDANCE_SERVICE_REQUIRED', 'Attendance Service no está disponible.');
    return this.attendance;
  }
}

function professorExternalId(request: FastifyRequest): string {
  return request.uatSession.login.parametros?.Id_Plantilla_AdmonUAT?.toString().trim()
    || request.uatSession.login.parametros?.Cve_Usuario_AdmonUAT?.toString().trim()
    || request.uatSession.username;
}
