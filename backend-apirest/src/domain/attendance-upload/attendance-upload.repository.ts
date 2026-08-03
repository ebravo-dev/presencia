import type {
  AttendanceUploadBatchView,
  AttendanceUploadJobClaim,
  CreateAttendanceUploadBatchInput,
} from './attendance-upload.types.js';

export interface AttendanceUploadRepository {
  createBatch(input: CreateAttendanceUploadBatchInput): Promise<AttendanceUploadBatchView>;
  findLatestJobStatuses(ownerUsername: string, clientRecordIds: string[]): Promise<AttendanceUploadBatchView['jobs']>;
  recoverStaleJobs(staleBefore: Date): Promise<number>;
  claimNextJob(now: Date): Promise<AttendanceUploadJobClaim | null>;
  completeJob(job: AttendanceUploadJobClaim): Promise<void>;
  retryJob(jobId: string, error: string, nextAttemptAt: Date): Promise<void>;
  failJob(job: AttendanceUploadJobClaim, error: string): Promise<void>;
  refreshBatch(batchId: string): Promise<void>;
}
