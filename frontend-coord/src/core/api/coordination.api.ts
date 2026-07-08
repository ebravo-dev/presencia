import { api, superApi } from './client';
import type { Assignment, Beacon, CoordinatorAccount, CoordinatorUser, InfrastructureSummaryResponse, OverviewResponse, ProfessorOption, RangeReportResponse, SharedClassAssignment, StudentDeviceBinding, SuperUser, TeacherAssignmentsResponse, TeachersResponse, WeeklyReportResponse } from './types';

export const coordinationApi = {
  login: async (input: { email: string; password: string }) => (await api.post<{ data: { user: CoordinatorUser; expiresAt: string } }>('/coordinacion/auth/login', input)).data,
  me: async () => (await api.get<{ data: { user: CoordinatorUser } }>('/coordinacion/auth/me')).data,
  logout: async () => { await api.post('/coordinacion/auth/logout'); },
  overview: async () => (await api.get<OverviewResponse>('/coordinacion/resumen')).data,
  infrastructureSummary: async () => (await api.get<InfrastructureSummaryResponse>('/coordinacion/infraestructura/resumen')).data,
  teachers: async (params: { search?: string; coordinationId?: string; page: number; pageSize: number }) => (await api.get<TeachersResponse>('/coordinacion/profesores', { params })).data,
  assignments: async (teacherId: string) => (await api.get<TeacherAssignmentsResponse>(`/coordinacion/profesores/${teacherId}/asignaciones`)).data,
  weeklyReport: async (params: { teacherId: string; weekStart: string }) => (await api.get<WeeklyReportResponse>('/coordinacion/reportes/asistencia-semanal', { params })).data,
  rangeReport: async (params: { teacherId: string; startDate: string; endDate: string }) => (await api.get<RangeReportResponse>('/coordinacion/reportes/asistencia-rango', { params })).data,
  sharedClassOptions: async () => (await api.get<{ data: { teachers: ProfessorOption[]; assignments: Assignment[] } }>('/coordinacion/clases-compartidas/opciones')).data,
  sharedClasses: async () => (await api.get<{ data: SharedClassAssignment[] }>('/coordinacion/clases-compartidas')).data,
  createSharedClass: async (input: { sourceAssignmentId: string; assignedTeacherId: string; schoolCycleYear: number; schoolCycleTerm: 1 | 2 | 3; active?: boolean; notes?: string | null }) => (await api.post<{ data: SharedClassAssignment }>('/coordinacion/clases-compartidas', input)).data,
  updateSharedClass: async (id: string, input: Partial<{ sourceAssignmentId: string; assignedTeacherId: string; schoolCycleYear: number; schoolCycleTerm: 1 | 2 | 3; active: boolean; notes: string | null }>) => (await api.put<{ data: SharedClassAssignment }>(`/coordinacion/clases-compartidas/${id}`, input)).data,
  deleteSharedClass: async (id: string) => { await api.delete(`/coordinacion/clases-compartidas/${id}`); },
};

export const superUserApi = {
  login: async (input: { password: string }) => (await superApi.post<{ data: { user: SuperUser; expiresAt: string } }>('/superUsuario/auth/login', input)).data,
  me: async () => (await superApi.get<{ data: { user: SuperUser } }>('/superUsuario/auth/me')).data,
  logout: async () => { await superApi.post('/superUsuario/auth/logout'); },
  coordinators: async () => (await superApi.get<{ data: CoordinatorAccount[]; meta: { generatedAt: string } }>('/superUsuario/coordinadores')).data,
  createCoordinator: async (input: { email: string; name: string; password: string; role: string }) => (await superApi.post<{ data: CoordinatorAccount }>('/superUsuario/coordinadores', input)).data,
  updateCoordinator: async (id: string, input: Partial<{ email: string; name: string; password: string; role: string; disabled: boolean }>) => (await superApi.put<{ data: CoordinatorAccount }>(`/superUsuario/coordinadores/${id}`, input)).data,
  deleteCoordinator: async (id: string) => { await superApi.delete(`/superUsuario/coordinadores/${id}`); },
  beacons: async () => (await superApi.get<{ data: Beacon[] }>('/superUsuario/beacons')).data,
  createBeacon: async (input: { classroom: string; uuid: string }) => (await superApi.post<{ data: Beacon }>('/superUsuario/beacons', input)).data,
  updateBeacon: async (id: string, input: Partial<{ classroom: string; uuid: string }>) => (await superApi.put<{ data: Beacon }>(`/superUsuario/beacons/${id}`, input)).data,
  deleteBeacon: async (id: string) => { await superApi.delete(`/superUsuario/beacons/${id}`); },
  studentDeviceBindings: async (params: { q?: string }) => (await superApi.get<{ data: StudentDeviceBinding[] }>('/superUsuario/alumnos-vinculados', { params })).data,
  deleteStudentDeviceBinding: async (matricula: string) => { await superApi.delete(`/superUsuario/alumnos-vinculados/${encodeURIComponent(matricula)}`); },
};
