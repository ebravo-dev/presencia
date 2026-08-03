import type { UatAsistenciaAlumnoInput } from '../types/uat.interfaces.js';

export interface AttendanceUploadRecordInput {
  clientRecordId: string;
  attendanceSessionId: string;
  attendanceVersion: number;
  idGrupo: number;
  fechaInicio: string;
  attendances: UatAsistenciaAlumnoInput[];
}

export interface CreateAttendanceUploadBatchInput {
  ownerUsername: string;
  credentialCipher: string;
  idempotencyKey: string;
  records: Array<AttendanceUploadRecordInput & { payloadHash: string }>;
}

export interface AttendanceUploadJobClaim {
  id: string;
  batchId: string;
  ownerUsername: string;
  clientRecordId: string;
  attendanceSessionId: string | null;
  attendanceVersion: number | null;
  idGrupo: number;
  fechaInicio: string;
  attendances: UatAsistenciaAlumnoInput[];
  attempts: number;
  credentialCipher: string;
}

export interface AttendanceUploadBatchView {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  totalRecords: number;
  completedRecords: number;
  failedRecords: number;
  createdAt: Date;
  completedAt: Date | null;
  jobs: Array<{
    clientRecordId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    attempts: number;
    error: string | null;
  }>;
}
