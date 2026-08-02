import { createHash } from 'node:crypto';
import type { AttendanceRepository } from '../domain/attendance.repository.js';
import { AttendanceDomainError, type CaptureAttendanceCommand } from '../domain/attendance.js';

export class CaptureAttendanceService {
  constructor(private readonly repository: AttendanceRepository) {}

  async capture(command: CaptureAttendanceCommand) {
    const normalized = {
      ...command,
      professorExternalId: command.professorExternalId.trim(),
      externalGroupId: command.externalGroupId.trim(),
      entries: command.entries.map((entry) => ({
        ...(entry.matricula ? { matricula: entry.matricula.trim().toUpperCase() } : {}),
        ...(entry.uatStudentId ? { uatStudentId: entry.uatStudentId } : {}),
        status: entry.status,
      })).sort((left, right) => entryKey(left).localeCompare(entryKey(right))),
    };
    const identifiers = normalized.entries.map(entryKey);
    if (identifiers.some((value) => !value) || new Set(identifiers).size !== identifiers.length) {
      throw new AttendanceDomainError('DUPLICATE_MATRICULA', 'La captura contiene matrículas duplicadas.');
    }
    const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    return this.repository.capture(normalized, requestHash);
  }
}

function entryKey(entry: { matricula?: string; uatStudentId?: number }): string {
  return entry.matricula ? `matricula:${entry.matricula}` : entry.uatStudentId ? `uat:${entry.uatStudentId}` : '';
}
