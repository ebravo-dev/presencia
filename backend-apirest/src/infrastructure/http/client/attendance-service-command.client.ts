import { ApiError } from '../../../errors/api-error.js';
import type {
  AttendanceBindingClient,
  StudentDeviceBindingInput,
  StudentDeviceBindingResponse,
} from '../../../application/ports/attendance-binding.client.js';

export class AttendanceServiceCommandClient implements AttendanceBindingClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly internalToken: string, private readonly timeoutMs = 10_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  health(): Promise<unknown> {
    return this.request('/health/ready', { method: 'GET' });
  }

  async applyRoster(input: AttendanceRosterInput): Promise<void> {
    await this.request(`/internal/v1/attendance/rosters/${encodeURIComponent(input.externalGroupId)}`, {
      method: 'PUT',
      body: input,
    });
  }

  createStudentDeviceBinding(input: StudentDeviceBindingInput): Promise<StudentDeviceBindingResponse> {
    return this.request('/internal/v1/attendance/device-bindings/initial', {
      method: 'POST',
      body: input,
    });
  }

  replaceStudentDeviceBinding(input: {
    matricula: string;
    attendanceUuid: string;
    deviceBindingId?: string | null;
    platform?: 'android' | 'ios' | null;
    deviceInfo?: string | null;
    actorIdentityId: string;
    actorRole: 'COORDINATOR' | 'SUPER_USER';
    reason: string;
    correlationId: string;
  }): Promise<{ data: StudentDeviceBindingValue }> {
    return this.request(`/internal/v1/attendance/device-bindings/${encodeURIComponent(input.matricula)}`, {
      method: 'PUT',
      correlationId: input.correlationId,
      body: withoutCorrelationId(input),
    });
  }

  async unbindStudentDevice(input: {
    matricula: string;
    actorIdentityId: string;
    actorRole: 'COORDINATOR' | 'SUPER_USER';
    reason: string;
    correlationId: string;
  }): Promise<void> {
    await this.request(`/internal/v1/attendance/device-bindings/${encodeURIComponent(input.matricula)}`, {
      method: 'DELETE',
      correlationId: input.correlationId,
      body: {
        actorIdentityId: input.actorIdentityId,
        actorRole: input.actorRole,
        reason: input.reason,
      },
    });
  }

  listStudentDeviceBindings(input: { q?: string | undefined }): Promise<{ data: unknown[] }> {
    return this.request('/internal/v1/attendance/device-bindings', { method: 'GET', query: input });
  }

  resolveStudentDeviceBindings(input: { professorExternalId: string; matriculas: string[] }): Promise<{
    data: Array<{
      matricula: string;
      attendanceUuid: string;
      deviceBindingId: string | null;
      platform: string | null;
      bindingVersion: number;
    }>;
    missing: string[];
  }> {
    return this.request('/internal/v1/attendance/device-bindings/resolve', {
      method: 'POST',
      body: input,
    });
  }

  bindStudentDeviceByProfessor(input: {
    externalGroupId: string;
    professorExternalId: string;
    matricula: string;
    attendanceUuid: string;
    deviceBindingId: null;
    platform: 'ios';
    deviceInfo: string;
    actorIdentityId: string;
    actorRole: 'PROFESSOR';
    reason: string;
    correlationId: string;
  }): Promise<{ data: StudentDeviceBindingValue }> {
    return this.request('/internal/v1/attendance/device-bindings/professor', {
      method: 'POST', correlationId: input.correlationId, body: withoutCorrelationId(input),
    });
  }

  listClassroomBeacons(): Promise<{ data: ClassroomBeaconResponse[] }> {
    return this.request('/internal/v1/attendance/classroom-beacons', { method: 'GET' });
  }

  createClassroomBeacon(input: ClassroomBeaconInput & BeaconActorInput): Promise<{ data: ClassroomBeaconResponse }> {
    return this.request('/internal/v1/attendance/classroom-beacons', {
      method: 'POST', correlationId: input.correlationId, body: withoutCorrelationId(input),
    });
  }

  updateClassroomBeacon(id: string, input: Partial<ClassroomBeaconInput> & BeaconActorInput): Promise<{ data: ClassroomBeaconResponse }> {
    return this.request(`/internal/v1/attendance/classroom-beacons/${encodeURIComponent(id)}`, {
      method: 'PUT', correlationId: input.correlationId, body: withoutCorrelationId(input),
    });
  }

  async deleteClassroomBeacon(id: string, input: BeaconActorInput): Promise<void> {
    await this.request(`/internal/v1/attendance/classroom-beacons/${encodeURIComponent(id)}`, {
      method: 'DELETE', correlationId: input.correlationId, body: withoutCorrelationId(input),
    });
  }

  resolveClassroomBeacons(input: { professorExternalId: string; professorEmail?: string; classrooms: string[] }): Promise<{
    data: ClassroomBeaconResponse[]; missing: string[];
  }> {
    return this.request('/internal/v1/attendance/classroom-beacons/resolve', { method: 'POST', body: input });
  }

  observeProfessorEntry(input: ProfessorPresenceBase & {
    beaconUuid: string; clientDetectedAt?: string | null; rssi?: number | null;
    distance?: number | null; bluetoothAddress?: string | null;
  }) {
    return this.request('/internal/v1/attendance/presence/professor-entry', {
      method: 'POST', correlationId: input.correlationId, body: withoutCorrelationId(input),
    });
  }

  observeProfessorExit(input: ProfessorPresenceBase & { clientDetectedAt?: string | null }) {
    return this.request('/internal/v1/attendance/presence/professor-exit', {
      method: 'POST', correlationId: input.correlationId, body: withoutCorrelationId(input),
    });
  }

  observeStudentPresence(input: ProfessorPresenceBase & { detections: Array<{
    beaconUuid: string; detectedAt?: string | null; rssi?: number | null; distance?: number | null;
    txPower?: number | null; bluetoothAddress?: string | null; major?: number | null; minor?: number | null;
  }> }) {
    return this.request('/internal/v1/attendance/presence/student-detections', {
      method: 'POST', correlationId: input.correlationId, body: withoutCorrelationId(input),
    });
  }

  bindingInfrastructureSummary(): Promise<{
    data: { count: number; recentBindings: unknown[] }; meta: { generatedAt: string };
  }> {
    return this.request('/internal/v1/attendance/infrastructure/bindings', { method: 'GET' });
  }

  infrastructureSummary(): Promise<{
    data: {
      counts: { beacons: number; studentDeviceBindings: number; studentBleAttendances: number };
      recentBindings: unknown[];
      recentBeacons: ClassroomBeaconResponse[];
    };
    meta: { generatedAt: string };
  }> {
    return this.request('/internal/v1/attendance/infrastructure/summary', { method: 'GET' });
  }

  attendanceSettings(): Promise<{ data: AttendanceSettingsResponse }> {
    return this.request('/internal/v1/attendance/settings', { method: 'GET' });
  }

  updateAttendanceSettings(input: {
    teacherAttendanceToleranceMinutes: number;
    actorIdentityId: string;
    actorRole: 'COORDINATOR' | 'SUPER_USER';
  }): Promise<{ data: AttendanceSettingsResponse }> {
    return this.request('/internal/v1/attendance/settings', {
      method: 'PUT',
      body: input,
    });
  }

  async resetDemoData(): Promise<void> {
    await this.request('/internal/v1/attendance/demo-data', { method: 'DELETE' });
  }

  async purgeAllData(): Promise<void> {
    await this.request('/internal/v1/attendance/data/purge', {
      method: 'POST', body: { confirmation: 'PURGE_ALL_DATA' },
    });
  }

  private async request<T = unknown>(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; correlationId?: string | undefined;
      query?: Record<string, string | undefined> | undefined;
    },
  ): Promise<T> {
    let response: Response;
    try {
      const url = new URL(path, this.baseUrl);
      for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined) url.searchParams.set(key, value);
      response = await fetch(url, {
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
      throw new ApiError(502, 'ATTENDANCE_SERVICE_UNAVAILABLE', 'Attendance Service no está disponible.', {
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
      throw new ApiError(
        response.status,
        typeof body?.error === 'string' ? body.error : 'ATTENDANCE_BINDING_COMMAND_REJECTED',
        typeof body?.message === 'string' ? body.message : 'Attendance Service rechazó la operación.',
      );
    }
    return payload as T;
  }
}

export interface ClassroomBeaconResponse {
  id: string;
  uuid: string;
  classroom: string;
  classroomKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceSettingsResponse {
  teacherAttendanceToleranceMinutes: number;
  updatedAt: string | null;
}

export interface StudentDeviceBindingValue {
  id: string;
  matricula: string;
  attendanceUuid: string;
  deviceBindingId: string | null;
  platform: string | null;
  deviceInfo: string | null;
  bindingVersion: number;
  active: boolean;
  updatedAt: string;
}

interface ClassroomBeaconInput {
  uuid: string;
  classroom: string;
}

interface BeaconActorInput {
  actorIdentityId: string;
  actorRole: 'COORDINATOR' | 'SUPER_USER';
  reason: string;
  correlationId: string;
}

interface ProfessorPresenceBase {
  professorExternalId: string;
  externalGroupId: string;
  trustedGroupAuthorization: boolean;
  correlationId: string;
}

export interface AttendanceRosterInput {
  externalGroupId: string;
  uatGroupId?: number | null;
  name: string;
  groupLetter: string;
  professorExternalId: string;
  professorName?: string;
  professorEmail?: string | null;
  classroom?: string | null;
  period?: string | null;
  schedule: Record<string, unknown>;
  rosterVersion: string;
  rosterObservedAt: string;
  rosterAuthoritative: boolean;
  students: Array<{
    matricula: string;
    name: string;
    uatStudentId?: number | null;
    listNumber?: number | null;
  }>;
}

function withoutCorrelationId<T extends { correlationId: string }>(input: T): Omit<T, 'correlationId'> {
  const { correlationId: _, ...body } = input;
  return body;
}
