import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  AcademicServiceClient,
  type LegacySharedClassImportRecord,
} from '../infrastructure/http/client/academic-service.client.js';

const BATCH_SIZE = 250;

export async function importSharedClassesToAcademic() {
  const academicServiceUrl = requiredEnv('ACADEMIC_SERVICE_URL');
  const internalToken = requiredEnv('INTERNAL_API_TOKEN');
  const prisma = new PrismaClient();
  const client = new AcademicServiceClient(academicServiceUrl, internalToken, true, 30_000);
  try {
    const assignments = await prisma.sharedClassAssignment.findMany({
      include: {
        sourceAssignment: {
          include: { teacher: true, subject: true, coordination: true },
        },
        assignedTeacher: true,
      },
      orderBy: { updatedAt: 'asc' },
    });
    const totals = { imported: 0, updated: 0, unchanged: 0 };
    for (let offset = 0; offset < assignments.length; offset += BATCH_SIZE) {
      const records = assignments.slice(offset, offset + BATCH_SIZE).map(toImportRecord);
      const { data } = await client.importLegacySharedClasses(records);
      totals.imported += data.imported;
      totals.updated += data.updated;
      totals.unchanged += data.unchanged;
    }
    return { total: assignments.length, ...totals };
  } finally {
    await prisma.$disconnect();
  }
}

function toImportRecord(
  assignment: Awaited<ReturnType<PrismaClient['sharedClassAssignment']['findMany']>>[number] & {
    sourceAssignment: {
      externalGroupId: string; groupCode: string | null; schoolCycleExternalId: string;
      schoolCycleName: string | null; classroom: string | null; educationLevel: string | null;
      period: string | null; schedule: unknown;
      teacher: LegacyTeacherRecord;
      subject: { externalId: string; code: string | null; name: string };
      coordination: { externalId: string; name: string; shortName: string | null };
    };
    assignedTeacher: LegacyTeacherRecord;
  },
): LegacySharedClassImportRecord {
  return {
    legacySourceId: assignment.id,
    schoolCycleYear: assignment.schoolCycleYear,
    schoolCycleTerm: assignment.schoolCycleTerm,
    active: assignment.active,
    notes: assignment.notes,
    createdAt: assignment.createdAt.toISOString(),
    observedAt: assignment.updatedAt.toISOString(),
    sourceAssignment: {
      externalGroupId: assignment.sourceAssignment.externalGroupId,
      groupCode: assignment.sourceAssignment.groupCode,
      schoolCycleExternalId: assignment.sourceAssignment.schoolCycleExternalId,
      schoolCycleName: assignment.sourceAssignment.schoolCycleName,
      classroom: assignment.sourceAssignment.classroom,
      educationLevel: assignment.sourceAssignment.educationLevel,
      period: assignment.sourceAssignment.period,
      schedule: asRecord(assignment.sourceAssignment.schedule),
      teacher: teacherValue(assignment.sourceAssignment.teacher),
      subject: assignment.sourceAssignment.subject,
      coordination: assignment.sourceAssignment.coordination,
    },
    assignedTeacher: teacherValue(assignment.assignedTeacher),
  };
}

interface LegacyTeacherRecord {
  externalId: string;
  institutionalCode: string | null;
  name: string;
  email: string | null;
  lastAuthenticatedAt: Date;
}

function teacherValue(teacher: LegacyTeacherRecord) {
  return {
    externalId: teacher.externalId,
    institutionalCode: teacher.institutionalCode,
    name: teacher.name,
    email: teacher.email,
    lastAuthenticatedAt: teacher.lastAuthenticatedAt.toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryPoint) {
  importSharedClassesToAcademic()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
