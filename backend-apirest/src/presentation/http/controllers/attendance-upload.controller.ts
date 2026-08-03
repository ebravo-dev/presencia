import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AttendanceUploadService } from '../../../application/services/attendance-upload.service.js';
import { parsePayload } from '../schemas/uat.schemas.js';
import { attendanceRecordStatusesSchema } from '../schemas/attendance-upload.schemas.js';

export class AttendanceUploadController {
  constructor(private readonly service: AttendanceUploadService) {}

  recordStatuses = async (request: FastifyRequest, reply: FastifyReply) => {
    const { clientRecordIds } = parsePayload(attendanceRecordStatusesSchema, request.body);
    const jobs = await this.service.getRecordStatuses(request.uatSession.username, clientRecordIds);
    return reply.send({ data: jobs });
  };
}
