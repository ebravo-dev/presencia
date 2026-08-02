import type { AttendanceUploadService } from '../services/attendance-upload.service.js';
import type { UatService } from '../services/uat.service.js';
import type { AttendanceUploadRequestedEvent } from '../../domain/events/attendance-upload-requested.event.js';

export interface AttendanceUploadWakePort { wake(): void }

export class ProcessAttendanceUploadRequestedUseCase {
  constructor(
    private readonly uatService: UatService,
    private readonly uploads: AttendanceUploadService,
    private readonly worker: AttendanceUploadWakePort,
  ) {}

  async execute(event: AttendanceUploadRequestedEvent) {
    const { payload } = event;
    if (!payload.uatSessionId) throw new Error('ATTENDANCE_UAT_SESSION_REQUIRED');
    const idGrupo = payload.uatGroupId ?? positiveInteger(payload.externalGroupId);
    if (!idGrupo) throw new Error('ATTENDANCE_UAT_GROUP_ID_REQUIRED');
    const session = await this.uatService.getSessionOrThrow(payload.uatSessionId);
    const weeks = (await this.uatService.getSemanasGrupoPorSesion(payload.uatSessionId, { Id_Grupo: idGrupo })).data;
    const week = weeks.find((item) => isDateWithin(payload.date, value(item.Fec_Ini ?? item.fec_ini), value(item.Fec_Fin ?? item.fec_fin)));
    const fechaInicio = week ? value(week.Fec_Ini ?? week.fec_ini) : null;
    if (!fechaInicio) throw new Error('ATTENDANCE_UAT_WEEK_NOT_FOUND');
    const missingUatIds = payload.entries.filter(({ uatStudentId }) => !uatStudentId);
    if (missingUatIds.length > 0) throw new Error(`ATTENDANCE_UAT_STUDENT_ID_MISSING:${missingUatIds.length}`);

    const batch = await this.uploads.submit({
      ownerUsername: session.username,
      credentialCipher: session.credentialCipher,
      records: [{
        clientRecordId: `${payload.attendanceSessionId}:v${payload.version}`,
        idGrupo,
        fechaInicio,
        attendances: payload.entries.map((entry, index) => ({
          id_alumno: entry.uatStudentId!,
          num_pase_lista: entry.listNumber ?? index + 1,
          num_dia: dayNumber(payload.date),
          sn_asistencia: entry.status === 'PRESENT' || entry.status === 'LATE',
        })),
      }],
    });
    this.worker.wake();
    return { batchId: batch.id, clientRecordId: `${payload.attendanceSessionId}:v${payload.version}` };
  }
}

function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function value(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const normalized = String(input).trim();
  return normalized || null;
}

function isDateWithin(isoDate: string, rawStart: string | null, rawEnd: string | null): boolean {
  const target = parseDate(isoDate);
  const start = parseDate(rawStart);
  const end = parseDate(rawEnd);
  return Boolean(target && start && end && target >= start && target <= end);
}

function parseDate(valueToParse: string | null): number | null {
  if (!valueToParse) return null;
  const latin = valueToParse.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const normalized = latin
    ? `${latin[3]}-${latin[2]!.padStart(2, '0')}-${latin[1]!.padStart(2, '0')}T00:00:00.000Z`
    : `${valueToParse.slice(0, 10)}T00:00:00.000Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function dayNumber(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}
