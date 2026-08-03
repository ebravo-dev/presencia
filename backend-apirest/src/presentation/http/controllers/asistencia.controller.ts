import type { FastifyRequest } from 'fastify';
import type { UatService } from '../../../application/services/uat.service.js';
import type { AttendanceCaptureClient } from '../../../infrastructure/http/client/attendance-capture.client.js';
import type { AttendanceUploadService } from '../../../application/services/attendance-upload.service.js';
import { ApiError } from '../../../errors/api-error.js';
import { env } from '../../../config/env.js';
import {
  asistenciaGrupoQuerySchema,
  gruposProfesorQuerySchema,
  parsePayload,
  registrarAsistenciasBodySchema,
  semanasGrupoQuerySchema,
} from '../schemas/uat.schemas.js';

interface AttendanceUploadWakePort { wake(): void }

export class AsistenciaController {
  constructor(
    private readonly uatService: UatService,
    private readonly attendanceCaptureClient: AttendanceCaptureClient,
    private readonly attendanceUploads: AttendanceUploadService,
    private readonly attendanceUploadWorker: AttendanceUploadWakePort,
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

    const professorExternalId = request.uatSession.login.parametros?.Id_Plantilla_AdmonUAT?.toString()
      ?? request.uatSession.login.parametros?.Cve_Usuario_AdmonUAT?.toString()
      ?? request.uatSession.username;
    const dayNumbers = [...new Set(body.Asistencia.map(({ num_dia }) => num_dia))];
    if (dayNumbers.length !== 1) {
      throw new ApiError(400, 'ATTENDANCE_MULTIPLE_DAYS', 'Una captura sólo puede corresponder a un día.');
    }
    const capture = await this.attendanceCaptureClient.capture({
      correlationId: request.id,
      externalGroupId: String(body.Id_Grupo),
      professorExternalId,
      date: dateFromWeekStart(body.Fec_Ini, dayNumbers[0]!),
      entries: body.Asistencia.map((attendance) => ({
        uatStudentId: attendance.id_alumno,
        status: attendance.sn_asistencia ? 'PRESENT' : 'ABSENT',
      })),
    });
    if (env.PRESENCIA_DEBUG_MODE) {
      await this.uatService.registrarAsistencias(
        request.uatSession.id,
        body.Id_Grupo,
        body.Fec_Ini,
        body.Asistencia,
      );
    }
    if (capture.data.uploadStatus === 'PENDING') {
      await this.attendanceUploads.submit({
        ownerUsername: request.uatSession.username,
        credentialCipher: request.uatSession.credentialCipher,
        records: [{
          clientRecordId: body.ClientRecordId,
          attendanceSessionId: capture.data.attendanceSessionId,
          attendanceVersion: capture.data.version,
          idGrupo: body.Id_Grupo,
          fechaInicio: body.Fec_Ini,
          attendances: body.Asistencia,
        }],
      });
      this.attendanceUploadWorker.wake();
    }
    return capture;
  };
}

function dateFromWeekStart(value: string, dayNumber: number): string {
  const latin = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const normalized = latin
    ? `${latin[3]}-${latin[2]!.padStart(2, '0')}-${latin[1]!.padStart(2, '0')}T00:00:00.000Z`
    : `${value.slice(0, 10)}T00:00:00.000Z`;
  const start = new Date(normalized);
  if (Number.isNaN(start.getTime())) throw new ApiError(400, 'ATTENDANCE_WEEK_DATE_INVALID', 'Fec_Ini no es una fecha válida.');
  start.setUTCDate(start.getUTCDate() + dayNumber - 1);
  return start.toISOString().slice(0, 10);
}
