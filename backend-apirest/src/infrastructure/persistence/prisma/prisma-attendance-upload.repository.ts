import { Prisma, type PrismaClient } from '@prisma/client';
import type { AttendanceUploadRepository } from '../../../domain/attendance-upload/attendance-upload.repository.js';
import type {
  AttendanceUploadBatchView,
  AttendanceUploadJobClaim,
  CreateAttendanceUploadBatchInput,
} from '../../../domain/attendance-upload/attendance-upload.types.js';
import type { UatAsistenciaAlumnoInput } from '../../../domain/types/uat.interfaces.js';

const batchInclude = { jobs: { orderBy: { createdAt: 'asc' as const } } };

export class PrismaAttendanceUploadRepository implements AttendanceUploadRepository {
  constructor(private readonly db: PrismaClient) {}

  async createBatch(input: CreateAttendanceUploadBatchInput): Promise<AttendanceUploadBatchView> {
    const existing = await this.db.attendanceUploadBatch.findUnique({
      where: {
        ownerUsername_idempotencyKey: {
          ownerUsername: input.ownerUsername,
          idempotencyKey: input.idempotencyKey,
        },
      },
      include: batchInclude,
    });
    if (existing) {
      if (existing.jobs.some((job) => job.status === 'FAILED')) {
        await this.db.$transaction([
          this.db.attendanceUploadBatch.update({
            where: { id: existing.id },
            data: { credentialCipher: input.credentialCipher, status: 'PENDING', completedAt: null },
          }),
          this.db.attendanceUploadJob.updateMany({
            where: { batchId: existing.id, status: 'FAILED' },
            data: {
              status: 'PENDING',
              attempts: 0,
              nextAttemptAt: new Date(),
              lockedAt: null,
              completedAt: null,
              error: null,
            },
          }),
        ]);
        const retried = await this.db.attendanceUploadBatch.findUniqueOrThrow({
          where: { id: existing.id },
          include: batchInclude,
        });
        return toBatchView(retried);
      }
      return toBatchView(existing);
    }

    try {
      const created = await this.db.attendanceUploadBatch.create({
        data: {
          ownerUsername: input.ownerUsername,
          idempotencyKey: input.idempotencyKey,
          credentialCipher: input.credentialCipher,
          totalRecords: input.records.length,
          jobs: {
            create: input.records.map((record) => ({
              ownerUsername: input.ownerUsername,
              clientRecordId: record.clientRecordId,
              idGrupo: record.idGrupo,
              fechaInicio: record.fechaInicio,
              attendances: record.attendances as Prisma.InputJsonValue,
              payloadHash: record.payloadHash,
            })),
          },
        },
        include: batchInclude,
      });
      return toBatchView(created);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const raced = await this.db.attendanceUploadBatch.findUniqueOrThrow({
        where: {
          ownerUsername_idempotencyKey: {
            ownerUsername: input.ownerUsername,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: batchInclude,
      });
      return toBatchView(raced);
    }
  }

  async findBatch(ownerUsername: string, batchId: string): Promise<AttendanceUploadBatchView | null> {
    const batch = await this.db.attendanceUploadBatch.findFirst({
      where: { id: batchId, ownerUsername },
      include: batchInclude,
    });
    return batch ? toBatchView(batch) : null;
  }

  async findLatestJobStatuses(ownerUsername: string, clientRecordIds: string[]): Promise<AttendanceUploadBatchView['jobs']> {
    const jobs = await this.db.attendanceUploadJob.findMany({
      where: { ownerUsername, clientRecordId: { in: clientRecordIds } },
      orderBy: { createdAt: 'desc' },
      select: { clientRecordId: true, status: true, attempts: true, error: true },
    });
    return [...new Map(jobs.map((job) => [job.clientRecordId, job])).values()];
  }

  async recoverStaleJobs(staleBefore: Date): Promise<number> {
    const result = await this.db.attendanceUploadJob.updateMany({
      where: { status: 'PROCESSING', lockedAt: { lt: staleBefore } },
      data: { status: 'PENDING', lockedAt: null, nextAttemptAt: new Date(), error: 'Reanudado después de una interrupción.' },
    });
    return result.count;
  }

  async claimNextJob(now: Date): Promise<AttendanceUploadJobClaim | null> {
    const candidates = await this.db.attendanceUploadJob.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: 20,
      include: { batch: { select: { credentialCipher: true } } },
    });

    for (const candidate of candidates) {
      if (!candidate.batch.credentialCipher) continue;
      try {
        const claimed = await this.db.attendanceUploadJob.updateMany({
          where: { id: candidate.id, status: 'PENDING' },
          data: { status: 'PROCESSING', attempts: { increment: 1 }, lockedAt: now, error: null },
        });
        if (claimed.count !== 1) continue;
        return {
          id: candidate.id,
          batchId: candidate.batchId,
          ownerUsername: candidate.ownerUsername,
          clientRecordId: candidate.clientRecordId,
          idGrupo: candidate.idGrupo,
          fechaInicio: candidate.fechaInicio,
          attendances: candidate.attendances as unknown as UatAsistenciaAlumnoInput[],
          attempts: candidate.attempts + 1,
          credentialCipher: candidate.batch.credentialCipher,
        };
      } catch (error) {
        // A partial unique index permits only one PROCESSING job per professor.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    return null;
  }

  async completeJob(jobId: string): Promise<void> {
    await this.db.attendanceUploadJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', completedAt: new Date(), lockedAt: null, error: null },
    });
  }

  async retryJob(jobId: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.db.attendanceUploadJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', nextAttemptAt, lockedAt: null, error },
    });
  }

  async failJob(jobId: string, error: string): Promise<void> {
    await this.db.attendanceUploadJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', completedAt: new Date(), lockedAt: null, error },
    });
  }

  async refreshBatch(batchId: string): Promise<void> {
    const [batch, grouped] = await Promise.all([
      this.db.attendanceUploadBatch.findUniqueOrThrow({ where: { id: batchId }, select: { totalRecords: true } }),
      this.db.attendanceUploadJob.groupBy({ by: ['status'], where: { batchId }, _count: { _all: true } }),
    ]);
    const counts = new Map(grouped.map((entry) => [entry.status, entry._count._all]));
    const completed = counts.get('COMPLETED') ?? 0;
    const failed = counts.get('FAILED') ?? 0;
    const terminal = completed + failed === batch.totalRecords;
    const status = completed === batch.totalRecords
      ? 'COMPLETED'
      : failed === batch.totalRecords
        ? 'FAILED'
        : terminal
          ? 'PARTIAL'
          : (counts.get('PROCESSING') ?? 0) > 0
            ? 'PROCESSING'
            : 'PENDING';

    await this.db.attendanceUploadBatch.update({
      where: { id: batchId },
      data: {
        status,
        completedRecords: completed,
        failedRecords: failed,
        completedAt: terminal ? new Date() : null,
        ...(terminal ? { credentialCipher: null } : {}),
      },
    });
  }
}

type BatchWithJobs = Prisma.AttendanceUploadBatchGetPayload<{ include: typeof batchInclude }>;

function toBatchView(batch: BatchWithJobs): AttendanceUploadBatchView {
  return {
    id: batch.id,
    status: batch.status,
    totalRecords: batch.totalRecords,
    completedRecords: batch.completedRecords,
    failedRecords: batch.failedRecords,
    createdAt: batch.createdAt,
    completedAt: batch.completedAt,
    jobs: batch.jobs.map((job) => ({
      clientRecordId: job.clientRecordId,
      status: job.status,
      attempts: job.attempts,
      error: job.error,
    })),
  };
}
