import { Worker, Job } from 'bullmq';
import {
    redisConnection,
    QUEUE_NAMES,
    type AttendanceUploadJobData,
    type AttendanceUploadJobResult,
} from '../../core/queue/queue.config.js';
import { scraperService } from '../scraper/scraper.service.js';
import { prisma } from '../../core/database/prisma.js';
import { SyncStatus, PortalSyncStatus } from '@prisma/client';

interface UploadStudent {
    studentId: string;
    matricula: string;
    name: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
}

async function processAttendanceUploadJob(
    job: Job<AttendanceUploadJobData, AttendanceUploadJobResult, string>
): Promise<AttendanceUploadJobResult> {
    const {
        professorId,
        email,
        password,
        attendanceRecordId,
        syncJobId,
        groupId,
        date,
        attendances,
    } = job.data;

    const attendanceRecord = await prisma.attendanceRecord.findUnique({
        where: { id: attendanceRecordId },
        include: {
            group: true,
        },
    });

    if (!attendanceRecord) {
        throw new Error('Attendance record not found');
    }

    await prisma.attendanceRecord.update({
        where: { id: attendanceRecordId },
        data: {
            portalSyncStatus: PortalSyncStatus.IN_PROGRESS,
            portalSyncError: null,
        },
    });

    await prisma.syncJob.update({
        where: { id: syncJobId },
        data: {
            status: SyncStatus.IN_PROGRESS,
            currentGroupName: 'Conectando con el portal UAT...',
            currentGroup: 1,
            totalGroups: attendances.length,
        },
    });

    const students = await prisma.student.findMany({
        where: {
            id: { in: attendances.map((a) => a.studentId) },
            groupId,
        },
        select: {
            id: true,
            matricula: true,
            name: true,
        },
    });

    const studentMap = new Map(students.map((s) => [s.id, s]));

    const uploadStudents: UploadStudent[] = attendances
        .map((attendance) => {
            const student = studentMap.get(attendance.studentId);
            if (!student) {
                return null;
            }

            return {
                studentId: student.id,
                matricula: student.matricula,
                name: student.name,
                status: attendance.status,
            };
        })
        .filter((student): student is UploadStudent => student !== null);

    if (uploadStudents.length === 0) {
        throw new Error('No matching students found for attendance upload');
    }

    let processedCount = 0;

    try {
        await scraperService.submitAttendanceForGroup({
            email,
            password,
            groupCode: attendanceRecord.group.code,
            date,
            students: uploadStudents,
            onProgress: async (studentName: string, index: number) => {
                processedCount = index + 1;
                await prisma.syncJob.update({
                    where: { id: syncJobId },
                    data: {
                        currentGroupName: `Marcando asistencia: ${studentName} (${index + 1}/${uploadStudents.length})`,
                        currentGroup: index + 1,
                        totalGroups: uploadStudents.length,
                    },
                });
            },
        });

        await prisma.attendanceRecord.update({
            where: { id: attendanceRecordId },
            data: {
                portalSyncStatus: PortalSyncStatus.COMPLETED,
                portalSyncError: null,
                portalSyncedAt: new Date(),
            },
        });

        await prisma.syncJob.update({
            where: { id: syncJobId },
            data: {
                status: SyncStatus.COMPLETED,
                completedAt: new Date(),
                currentGroupName: 'Asistencia subida correctamente',
                currentGroup: uploadStudents.length,
                totalGroups: uploadStudents.length,
                error: null,
            },
        });

        await job.updateData({
            ...job.data,
            password: '[REDACTED]',
        });

        return {
            success: true,
            attendanceRecordId,
            processedCount: uploadStudents.length,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const attemptNumber = job.attemptsMade + 1;
        const maxAttempts = job.opts.attempts || 3;
        const isRetryable = attemptNumber < maxAttempts;

        if (isRetryable) {
            await prisma.syncJob.update({
                where: { id: syncJobId },
                data: {
                    currentGroupName: `Reintentando... (intento ${attemptNumber + 1}/${maxAttempts})`,
                    error: `Intento ${attemptNumber} falló: ${errorMessage}`,
                },
            });
        } else {
            await prisma.attendanceRecord.update({
                where: { id: attendanceRecordId },
                data: {
                    portalSyncStatus: PortalSyncStatus.FAILED,
                    portalSyncError: errorMessage,
                },
            });

            await prisma.syncJob.update({
                where: { id: syncJobId },
                data: {
                    status: SyncStatus.FAILED,
                    completedAt: new Date(),
                    error: errorMessage,
                },
            });
        }

        await job.updateData({
            ...job.data,
            password: '[REDACTED]',
        });

        throw error;
    }
}

export function createAttendanceUploadWorker(): Worker<AttendanceUploadJobData, AttendanceUploadJobResult, string> {
    const worker = new Worker<AttendanceUploadJobData, AttendanceUploadJobResult, string>(
        QUEUE_NAMES.ATTENDANCE_UPLOAD,
        processAttendanceUploadJob,
        {
            connection: redisConnection,
            concurrency: 1,
            maxStalledCount: 2,
            limiter: {
                max: 3,
                duration: 60000,
            },
        }
    );

    worker.on('completed', (job) => {
        console.log(`✅ Attendance job ${job.id} completed`);
    });

    worker.on('failed', (job, error) => {
        console.error(`❌ Attendance job ${job?.id} failed:`, error.message);
    });

    worker.on('error', (error) => {
        console.error('❌ Attendance worker error:', error);
    });

    console.log('👷 Attendance upload worker started');

    return worker;
}

export async function initializeAttendanceUploadWorker(): Promise<Worker<AttendanceUploadJobData, AttendanceUploadJobResult, string>> {
    await scraperService.init();
    return createAttendanceUploadWorker();
}
