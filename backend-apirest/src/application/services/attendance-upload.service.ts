import { createHash } from 'node:crypto';
import type { AttendanceUploadRepository } from '../../domain/attendance-upload/attendance-upload.repository.js';
import type { AttendanceUploadRecordInput } from '../../domain/attendance-upload/attendance-upload.types.js';

export class AttendanceUploadService {
  constructor(private readonly repository: AttendanceUploadRepository) {}

  async submit(input: { ownerUsername: string; credentialCipher: string; records: AttendanceUploadRecordInput[] }) {
    const normalized = [...input.records]
      .map((record) => ({
        ...record,
        attendances: [...record.attendances].sort((a, b) => a.id_alumno - b.id_alumno),
      }))
      .sort((a, b) => a.clientRecordId.localeCompare(b.clientRecordId));

    const records = normalized.map((record) => ({
      ...record,
      payloadHash: hash(record),
    }));
    return this.repository.createBatch({
      ownerUsername: input.ownerUsername,
      credentialCipher: input.credentialCipher,
      idempotencyKey: hash(records.map(({ payloadHash, clientRecordId }) => ({ clientRecordId, payloadHash }))),
      records,
    });
  }

  async getRecordStatuses(ownerUsername: string, clientRecordIds: string[]) {
    return this.repository.findLatestJobStatuses(ownerUsername, [...new Set(clientRecordIds)]);
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
