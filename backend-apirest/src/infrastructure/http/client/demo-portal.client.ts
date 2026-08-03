import { ApiError } from '../../../errors/api-error.js';

export interface DemoPortalTeacher {
  id: string;
  externalId: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoPortalStudent {
  id: string;
  uatStudentId: number;
  matricula: string;
  email: string;
  name: string;
  attendanceUuid: string;
  careerName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoPortalClass {
  id: string;
  groupId: number;
  professorId: string;
  code: string;
  groupLetter: string;
  name: string;
  level: string;
  classroom: string;
  period: string;
  beaconUuid: string;
  schedule: Partial<Record<string, Array<{ startTime: string; endTime: string }>>>;
  studentIds: string[];
  professor: DemoPortalTeacher | null;
  students: DemoPortalStudent[];
  createdAt: string;
  updatedAt: string;
}

export interface DemoPortalAttendanceWrite {
  id: string;
  groupId: number;
  weekStart: string;
  attendances: Array<{
    id_alumno: number;
    num_dia: number;
    sn_asistencia: boolean;
    status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  }>;
  createdAt: string;
}

export interface DemoPortalCatalog {
  enabled: boolean;
  settings: { teacherAttendanceToleranceMinutes: number };
  teachers: DemoPortalTeacher[];
  students: DemoPortalStudent[];
  classes: DemoPortalClass[];
  attendanceWrites: DemoPortalAttendanceWrite[];
  updatedAt: string;
}

export interface DemoPortalStatus extends DemoPortalCatalog {
  cycleId: number;
  cycleName: string;
  coordinationId: number;
  coordinationName: string;
}

export class DemoPortalClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly internalToken: string, private readonly timeoutMs = 10_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  health(): Promise<unknown> { return this.request('/health/ready', { method: 'GET', authenticate: false }); }
  status(): Promise<{ data: DemoPortalStatus }> { return this.request('/internal/v1/demo/status', { method: 'GET' }); }
  catalog(): Promise<{ data: DemoPortalCatalog }> { return this.request('/internal/v1/demo/catalog', { method: 'GET' }); }
  createTeacher(input: { email: string; name: string; password: string }) { return this.request<{ data: DemoPortalTeacher }>('/internal/v1/demo/teachers', { method: 'POST', body: input }); }
  updateTeacher(id: string, input: Partial<{ email: string; name: string; password: string }>) { return this.request<{ data: DemoPortalTeacher }>(`/internal/v1/demo/teachers/${encodeURIComponent(id)}`, { method: 'PUT', body: input }); }
  deleteTeacher(id: string) { return this.request<void>(`/internal/v1/demo/teachers/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  createStudent(input: { matricula: string; email: string; name: string; password: string; attendanceUuid?: string; careerName?: string }) { return this.request<{ data: DemoPortalStudent }>('/internal/v1/demo/students', { method: 'POST', body: input }); }
  updateStudent(id: string, input: Partial<{ matricula: string; email: string; name: string; password: string; attendanceUuid: string; careerName: string }>) { return this.request<{ data: DemoPortalStudent }>(`/internal/v1/demo/students/${encodeURIComponent(id)}`, { method: 'PUT', body: input }); }
  deleteStudent(id: string) { return this.request<void>(`/internal/v1/demo/students/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  createClass(input: {
    professorId?: string; professorEmail?: string; professorName?: string; code: string; groupLetter: string;
    name: string; level: string; classroom: string; period: string; beaconUuid: string;
    schedule: Partial<Record<string, Array<{ startTime: string; endTime: string }>>>; studentIds?: string[];
  }) { return this.request<{ data: DemoPortalClass }>('/internal/v1/demo/classes', { method: 'POST', body: input }); }
  updateClass(id: string, input: Partial<{
    code: string; groupLetter: string; name: string; level: string; classroom: string; period: string;
    beaconUuid: string; schedule: Partial<Record<string, Array<{ startTime: string; endTime: string }>>>; studentIds: string[];
  }>) { return this.request<{ data: DemoPortalClass }>(`/internal/v1/demo/classes/${encodeURIComponent(id)}`, { method: 'PUT', body: input }); }
  deleteClass(id: string) { return this.request<void>(`/internal/v1/demo/classes/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  addStudentToClass(classId: string, studentId: string) { return this.request<{ data: DemoPortalClass }>(`/internal/v1/demo/classes/${encodeURIComponent(classId)}/students`, { method: 'POST', body: { studentId } }); }
  removeStudentFromClass(classId: string, studentId: string) { return this.request<void>(`/internal/v1/demo/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' }); }
  simulateAttendance(classId: string, input: {
    date: string;
    entries: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' }>;
  }) { return this.request<{ data: DemoPortalAttendanceWrite }>(`/internal/v1/demo/classes/${encodeURIComponent(classId)}/simulate-attendance`, { method: 'POST', body: input }); }
  updateSettings(input: { teacherAttendanceToleranceMinutes: number }) { return this.request<{ data: { teacherAttendanceToleranceMinutes: number } }>('/internal/v1/demo/settings', { method: 'PUT', body: input }); }
  resetData() { return this.request<{ data: { deleted: { teachers: number; students: number; classes: number; attendanceWrites: number } } }>('/internal/v1/demo/data', { method: 'DELETE' }); }

  private async request<T>(path: string, options: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; authenticate?: boolean }): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        method: options.method,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(options.authenticate === false ? {} : { 'x-internal-service-token': this.internalToken }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      throw new ApiError(503, 'DEMO_PORTAL_UNAVAILABLE', 'El portal demo no está disponible.', {
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
      throw new ApiError(
        response.status,
        typeof body?.error === 'string' ? body.error : 'DEMO_PORTAL_REJECTED',
        typeof body?.message === 'string' ? body.message : 'El portal demo rechazó la operación.',
      );
    }
    return payload as T;
  }
}
