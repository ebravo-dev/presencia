import { ApiError } from '../../../errors/api-error.js';
import type {
  AcademicSnapshotPublisher,
  ProfessorAcademicSnapshotInput,
  StudentAcademicSnapshotInput,
  StudentAcademicSnapshotPublisher,
} from '../../../application/ports/academic-snapshot.publisher.js';

export class AcademicServiceClient implements AcademicSnapshotPublisher, StudentAcademicSnapshotPublisher {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 15_000,
  ) {}

  health(): Promise<unknown> {
    return this.request('/health/ready', { method: 'GET' });
  }

  async publishProfessorSnapshot(snapshot: ProfessorAcademicSnapshotInput): Promise<void> {
    return this.publish('/internal/v1/academic/snapshots/professors', snapshot);
  }

  async publishStudentSnapshot(snapshot: StudentAcademicSnapshotInput): Promise<void> {
    return this.publish('/internal/v1/academic/snapshots/students', snapshot);
  }

  activeAcademicCycle(): Promise<ActiveAcademicCycleResponse> {
    return this.request('/internal/v1/academic/cycles/active', { method: 'GET' });
  }

  changeActiveAcademicCycle(input: {
    cycleExternalId: number;
    actorIdentityId: string;
    actorRole: 'SUPER_USER';
    reason: string;
    correlationId: string;
  }): Promise<ActiveAcademicCycleResponse> {
    return this.request('/internal/v1/academic/cycles/active', {
      method: 'PUT', body: withoutCorrelationId(input), correlationId: input.correlationId,
    });
  }

  listSharedClassOptions(): Promise<unknown> {
    return this.request('/internal/v1/academic/shared-classes/options', { method: 'GET' });
  }

  async resetDemoData(): Promise<void> {
    await this.request('/internal/v1/academic/demo-data', { method: 'DELETE' });
  }

  listSharedClasses(): Promise<SharedClassListResponse> {
    return this.request('/internal/v1/academic/shared-classes', { method: 'GET' });
  }

  listSharedClassesForTeacher(input: { identity: string; year?: number; term?: number }): Promise<unknown> {
    return this.request('/internal/v1/academic/shared-classes/for-teacher', { method: 'POST', body: input });
  }

  createSharedClass(input: SharedClassCommandInput): Promise<unknown> {
    return this.request('/internal/v1/academic/shared-classes', {
      method: 'POST', body: withoutCorrelationId(input), correlationId: input.correlationId,
    });
  }

  updateSharedClass(id: string, input: Partial<SharedClassValueInput> & SharedClassActorInput): Promise<unknown> {
    return this.request(`/internal/v1/academic/shared-classes/${encodeURIComponent(id)}`, {
      method: 'PUT', body: withoutCorrelationId(input), correlationId: input.correlationId,
    });
  }

  async deleteSharedClass(id: string, input: SharedClassActorInput): Promise<void> {
    await this.request(`/internal/v1/academic/shared-classes/${encodeURIComponent(id)}`, {
      method: 'DELETE', body: withoutCorrelationId(input), correlationId: input.correlationId,
    });
  }

  importLegacySharedClasses(records: LegacySharedClassImportRecord[]): Promise<{
    data: { imported: number; updated: number; unchanged: number };
  }> {
    return this.request('/internal/v1/academic/shared-classes/import-legacy', {
      method: 'POST', body: { records }, correlationId: 'legacy-shared-class-import',
    });
  }

  private async publish(
    path: string,
    snapshot: ProfessorAcademicSnapshotInput | StudentAcademicSnapshotInput,
  ): Promise<void> {
    await this.request(path, { method: 'POST', body: snapshot, correlationId: snapshot.correlationId });
  }

  private async request<T = unknown>(
    path: string,
    options: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; correlationId?: string },
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        method: options.method,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          'x-internal-service-token': this.internalToken,
          ...(options.correlationId ? { 'x-correlation-id': options.correlationId } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      throw new ApiError(503, 'ACADEMIC_SERVICE_UNAVAILABLE', 'Academic Service no está disponible.', {
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
      throw new ApiError(
        response.status,
        typeof body?.error === 'string' ? body.error : 'ACADEMIC_SERVICE_ERROR',
        typeof body?.message === 'string' ? body.message : `Academic Service respondió ${response.status}.`,
      );
    }
    return payload as T;
  }
}

interface SharedClassValueInput {
  sourceAssignmentId: string;
  assignedTeacherId: string;
  schoolCycleYear: number;
  schoolCycleTerm: number;
  active?: boolean;
  notes?: string | null;
}

interface SharedClassActorInput {
  actorIdentityId: string;
  actorRole: 'COORDINATOR' | 'SYSTEM';
  reason: string;
  correlationId: string;
}

export interface LegacySharedClassImportRecord {
  legacySourceId: string;
  schoolCycleYear: number;
  schoolCycleTerm: number;
  active: boolean;
  notes: string | null;
  createdAt: string;
  observedAt: string;
  sourceAssignment: {
    externalGroupId: string;
    groupCode: string | null;
    schoolCycleExternalId: string;
    schoolCycleName: string | null;
    classroom: string | null;
    educationLevel: string | null;
    period: string | null;
    schedule: Record<string, unknown>;
    teacher: LegacySharedClassTeacher;
    subject: { externalId: string; code: string | null; name: string };
    coordination: { externalId: string; name: string; shortName: string | null };
  };
  assignedTeacher: LegacySharedClassTeacher;
}

export interface SharedClassListResponse {
  data: Array<{
    id: string;
    active: boolean;
    updatedAt: string;
    sourceAssignment: {
      groupCode: string | null;
      classroom: string | null;
      subject: { name: string };
      teacher: { name: string };
    };
    assignedTeacher: { name: string };
  }>;
  meta: { generatedAt: string };
}

export interface AcademicCycleOption {
  externalId: number;
  year: number;
  term: 1 | 2 | 3;
  name: string;
}

export interface ActiveAcademicCycleResponse {
  data: {
    active: AcademicCycleOption & {
      revision: number;
      updatedAt: string;
      updatedByIdentityId: string | null;
    };
    availableCycles: AcademicCycleOption[];
    lockedCycles: AcademicCycleOption[];
    nextUnlockAt: string;
    timeZone: string;
  };
}

interface LegacySharedClassTeacher {
  externalId: string;
  institutionalCode: string | null;
  name: string;
  email: string | null;
  lastAuthenticatedAt: string;
}

type SharedClassCommandInput = SharedClassValueInput & SharedClassActorInput;

function withoutCorrelationId<T extends { correlationId: string }>(input: T): Omit<T, 'correlationId'> {
  const { correlationId: _, ...body } = input;
  return body;
}
