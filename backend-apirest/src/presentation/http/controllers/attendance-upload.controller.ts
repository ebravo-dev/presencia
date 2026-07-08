import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AttendanceUploadService } from '../../../application/services/attendance-upload.service.js';
import type { AttendanceUploadWorker } from '../../../infrastructure/jobs/attendance-upload.worker.js';
import { parsePayload } from '../schemas/uat.schemas.js';
import {
  attendanceBatchParamsSchema,
  attendanceRecordStatusesSchema,
  submitAttendanceBatchSchema,
} from '../schemas/attendance-upload.schemas.js';

export class AttendanceUploadController {
  constructor(
    private readonly service: AttendanceUploadService,
    private readonly worker: AttendanceUploadWorker,
  ) {}

  submit = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parsePayload(submitAttendanceBatchSchema, request.body);
    const batch = await this.service.submit({
      ownerUsername: request.uatSession.username,
      credentialCipher: request.uatSession.credentialCipher,
      records: body.records.map((record) => ({
        clientRecordId: record.clientRecordId,
        idGrupo: record.Id_Grupo,
        fechaInicio: record.Fec_Ini,
        attendances: record.Asistencia,
      })),
    });
    this.worker.wake();
    return reply.code(202).send({ data: serializeBatch(batch) });
  };

  status = async (request: FastifyRequest, reply: FastifyReply) => {
    const { batchId } = parsePayload(attendanceBatchParamsSchema, request.params);
    const batch = await this.service.getBatch(request.uatSession.username, batchId);
    return reply.send({ data: serializeBatch(batch) });
  };

  recordStatuses = async (request: FastifyRequest, reply: FastifyReply) => {
    const { clientRecordIds } = parsePayload(attendanceRecordStatusesSchema, request.body);
    const jobs = await this.service.getRecordStatuses(request.uatSession.username, clientRecordIds);
    return reply.send({ data: jobs });
  };
}

function serializeBatch(batch: Awaited<ReturnType<AttendanceUploadService['getBatch']>>) {
  return {
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
  };
}
