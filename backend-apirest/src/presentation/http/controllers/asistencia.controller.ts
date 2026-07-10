import type { FastifyRequest } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import type { AttendanceBackendClient } from '../../../infrastructure/http/client/attendance-backend.client.js';
import { ApiError } from '../../../errors/api-error.js';
import {
  asistenciaGrupoQuerySchema,
  gruposProfesorQuerySchema,
  parsePayload,
  registrarAsistenciasBodySchema,
  semanasGrupoQuerySchema,
} from '../schemas/uat.schemas.js';

function toIsoDateTime(value: string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

export class AsistenciaController {
  constructor(
    private readonly uatService: UatService,
    private readonly attendanceBackendClient?: AttendanceBackendClient,
  ) {}

  gruposProfesor = async (request: FastifyRequest) => {
    const query = parsePayload(gruposProfesorQuerySchema, request.query);

    return this.uatService.getGruposProfesorPorSesion(request.uatSession.id, query);
  };

  semanasGrupo = async (request: FastifyRequest) => {
    const query = parsePayload(semanasGrupoQuerySchema, request.query);

    return this.uatService.getSemanasGrupoPorSesion(request.uatSession.id, query);
  };

  asistenciaGrupo = async (request: FastifyRequest) => {
    const query = parsePayload(asistenciaGrupoQuerySchema, request.query);

    return this.uatService.getAsistenciaGrupoPorSesion(request.uatSession.id, query);
  };

  guardar = async (request: FastifyRequest) => {
    const body = parsePayload(registrarAsistenciasBodySchema, request.body);

    if (body.DebugReportOnly) {
      if (!this.attendanceBackendClient) {
        throw new ApiError(500, 'ATTENDANCE_BACKEND_NOT_CONFIGURED', 'Backend de asistencia no configurado.');
      }

      request.log.info({
        professorEmail: request.uatSession.username,
        code: body.Code,
        groupLetter: body.GroupLetter,
        period: body.Period,
        date: body.Date,
        totalAttendances: body.Asistencia.length,
      }, 'debug attendance requested; skipping UAT portal upload');

      return this.attendanceBackendClient.recordDebugAttendance({
        professorEmail: request.uatSession.username,
        professorName: request.uatSession.login.parametros?.Txt_Usuario_AdmonUAT?.toString() ?? null,
        code: body.Code!,
        groupLetter: body.GroupLetter ?? '',
        period: body.Period!,
        groupName: body.GroupName ?? null,
        classroom: body.Classroom ?? null,
        level: body.Level ?? null,
        schedule: body.Schedule ?? null,
        createMissingGroup: body.CreateMissingGroup,
        date: body.Date!,
        professorEntryAt: toIsoDateTime(body.ProfessorEntryAt),
        professorExitAt: toIsoDateTime(body.ProfessorExitAt),
        attendances: body.Asistencia.map((attendance) => ({
          studentId: String(attendance.id_alumno),
          status: attendance.sn_asistencia ? 'PRESENT' : 'ABSENT',
        })),
      });
    }

    return this.uatService.registrarAsistencias(
      request.uatSession.id,
      body.Id_Grupo,
      body.Fec_Ini,
      body.Asistencia,
    );
  };
}
