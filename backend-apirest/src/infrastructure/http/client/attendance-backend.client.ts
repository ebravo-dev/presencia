import axios, { type AxiosInstance } from 'axios';

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
}
