import { api } from './client';
import type { CoordinatorUser, OverviewResponse, TeacherAssignmentsResponse, TeachersResponse, WeeklyReportResponse } from './types';

export const coordinationApi = {
  login: async (input: { email: string; password: string }) => (await api.post<{ data: { user: CoordinatorUser; expiresAt: string } }>('/coordinacion/auth/login', input)).data,
  me: async () => (await api.get<{ data: { user: CoordinatorUser } }>('/coordinacion/auth/me')).data,
  logout: async () => { await api.post('/coordinacion/auth/logout'); },
  overview: async () => (await api.get<OverviewResponse>('/coordinacion/resumen')).data,
  teachers: async (params: { search?: string; coordinationId?: string; page: number; pageSize: number }) => (await api.get<TeachersResponse>('/coordinacion/profesores', { params })).data,
  assignments: async (teacherId: string) => (await api.get<TeacherAssignmentsResponse>(`/coordinacion/profesores/${teacherId}/asignaciones`)).data,
  weeklyReport: async (params: { teacherId: string; weekStart: string }) => (await api.get<WeeklyReportResponse>('/coordinacion/reportes/asistencia-semanal', { params })).data,
};
