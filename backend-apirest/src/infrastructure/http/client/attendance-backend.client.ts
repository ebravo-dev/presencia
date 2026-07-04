import axios, { type AxiosInstance } from 'axios';
import { ApiError } from '../../../errors/api-error.js';
import type { JsonValue } from '../../../domain/types/uat.interfaces.js';

export interface AttendanceSourceRecord {
  date: string;
  portalSyncStatus: string;
  portalSyncError: string | null;
  portalSyncedAt: string | null;
  createdAt: string;
}

export interface AttendanceSourceGroup {
  id: string;
  code: string;
  groupLetter: string;
  name: string;
  level: string;
  classroom: string;
  schedule: unknown;
  period: string;
  attendanceRecords: AttendanceSourceRecord[];
}

export interface AttendanceSourceProfessor {
  id: string;
  institutionalEmail: string;
  name: string;
  groups: AttendanceSourceGroup[];
}

export class AttendanceBackendUnavailableError extends Error {}

export class AttendanceBackendClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string, serviceToken: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/+$/, ''), timeout: 10_000,
      headers: { 'X-Internal-Service-Token': serviceToken },
    });
  }

  async getWeeklyAttendance(input: { professorEmail: string; startDate: string; endDate: string }): Promise<AttendanceSourceProfessor | null> {
    try {
      const response = await this.http.get<{ data: AttendanceSourceProfessor }>('/internal/coordination/attendance-weekly', { params: input });
      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw new AttendanceBackendUnavailableError('No fue posible consultar el backend de asistencia.', { cause: error });
    }
  }

  async listBeacons() {
    return this.request(() => this.http.get('/internal/coordination/beacons'));
  }

  async createBeacon(input: { classroom: string; uuid: string }) {
    return this.request(() => this.http.post('/internal/coordination/beacons', input));
  }

  async updateBeacon(id: string, input: Partial<{ classroom: string; uuid: string }>) {
    return this.request(() => this.http.put(`/internal/coordination/beacons/${id}`, input));
  }

  async deleteBeacon(id: string) {
    await this.request(() => this.http.delete(`/internal/coordination/beacons/${id}`));
  }

  async listStudentDeviceBindings(input: { q?: string }) {
    return this.request(() => this.http.get('/internal/coordination/student-device-bindings', { params: input }));
  }

  async deleteStudentDeviceBinding(matricula: string) {
    await this.request(() => this.http.delete(`/internal/coordination/student-device-bindings/${encodeURIComponent(matricula)}`));
  }

  async getSubstitutionOptions() {
    return this.request(() => this.http.get('/internal/coordination/substitutions/options'));
  }

  async listSubstituteAssignments() {
    return this.request(() => this.http.get('/internal/coordination/substitute-assignments'));
  }

  async createSubstituteAssignment(input: {
    groupId: string;
    substituteProfessorId: string;
    startsAt?: string | null;
    endsAt?: string | null;
    active?: boolean;
    notes?: string | null;
  }) {
    return this.request(() => this.http.post('/internal/coordination/substitute-assignments', input));
  }

  async updateSubstituteAssignment(id: string, input: Partial<{
    groupId: string;
    substituteProfessorId: string;
    startsAt: string | null;
    endsAt: string | null;
    active: boolean;
    notes: string | null;
  }>) {
    return this.request(() => this.http.put(`/internal/coordination/substitute-assignments/${id}`, input));
  }

  async deleteSubstituteAssignment(id: string) {
    await this.request(() => this.http.delete(`/internal/coordination/substitute-assignments/${id}`));
  }

  private async request<T>(call: () => Promise<{ data: T }>): Promise<T> {
    try {
      return (await call()).data;
    } catch (error) {
      throw this.toApiError(error);
    }
  }

  private toApiError(error: unknown): ApiError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status) {
        const body = error.response?.data;
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          const record = body as Record<string, unknown>;
          return new ApiError(
            status,
            typeof record.error === 'string' ? record.error : 'ATTENDANCE_BACKEND_ERROR',
            typeof record.message === 'string' ? record.message : 'El backend de asistencia rechazo la solicitud.',
            record.details as JsonValue | undefined,
          );
        }

        return new ApiError(status, 'ATTENDANCE_BACKEND_ERROR', 'El backend de asistencia rechazo la solicitud.');
      }
    }

    return new ApiError(502, 'ATTENDANCE_BACKEND_UNAVAILABLE', 'No fue posible contactar el backend de asistencia.');
  }
}
