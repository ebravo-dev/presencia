import { api } from './client';
import type { Assignment, Beacon, CoordinatorUser, GroupOption, InfrastructureSummaryResponse, OverviewResponse, ProfessorOption, SharedClassAssignment, StudentDeviceBinding, SubstituteAssignment, TeacherAssignmentsResponse, TeachersResponse, WeeklyReportResponse } from './types';

export const coordinationApi = {
  login: async (input: { email: string; password: string }) => (await api.post<{ data: { user: CoordinatorUser; expiresAt: string } }>('/coordinacion/auth/login', input)).data,
  me: async () => (await api.get<{ data: { user: CoordinatorUser } }>('/coordinacion/auth/me')).data,
  logout: async () => { await api.post('/coordinacion/auth/logout'); },
  overview: async () => (await api.get<OverviewResponse>('/coordinacion/resumen')).data,
  teachers: async (params: { search?: string; coordinationId?: string; page: number; pageSize: number }) => (await api.get<TeachersResponse>('/coordinacion/profesores', { params })).data,
  assignments: async (teacherId: string) => (await api.get<TeacherAssignmentsResponse>(`/coordinacion/profesores/${teacherId}/asignaciones`)).data,
  weeklyReport: async (params: { teacherId: string; weekStart: string }) => (await api.get<WeeklyReportResponse>('/coordinacion/reportes/asistencia-semanal', { params })).data,
  infrastructureSummary: async () => (await api.get<InfrastructureSummaryResponse>('/coordinacion/infraestructura/resumen')).data,
  beacons: async () => (await api.get<{ data: Beacon[] }>('/coordinacion/infraestructura/beacons')).data,
  createBeacon: async (input: { classroom: string; uuid: string }) => (await api.post<{ data: Beacon }>('/coordinacion/infraestructura/beacons', input)).data,
  updateBeacon: async (id: string, input: Partial<{ classroom: string; uuid: string }>) => (await api.put<{ data: Beacon }>(`/coordinacion/infraestructura/beacons/${id}`, input)).data,
  deleteBeacon: async (id: string) => { await api.delete(`/coordinacion/infraestructura/beacons/${id}`); },
  studentDeviceBindings: async (params: { q?: string }) => (await api.get<{ data: StudentDeviceBinding[] }>('/coordinacion/infraestructura/alumnos-vinculados', { params })).data,
  deleteStudentDeviceBinding: async (matricula: string) => { await api.delete(`/coordinacion/infraestructura/alumnos-vinculados/${encodeURIComponent(matricula)}`); },
  substitutionOptions: async () => (await api.get<{ data: { professors: ProfessorOption[]; groups: GroupOption[] } }>('/coordinacion/infraestructura/sustituciones/opciones')).data,
  substituteAssignments: async () => (await api.get<{ data: SubstituteAssignment[] }>('/coordinacion/infraestructura/sustituciones')).data,
  createSubstituteAssignment: async (input: { groupId: string; substituteProfessorId: string; startsAt?: string | null; endsAt?: string | null; active?: boolean; notes?: string | null }) => (await api.post<{ data: SubstituteAssignment }>('/coordinacion/infraestructura/sustituciones', input)).data,
  updateSubstituteAssignment: async (id: string, input: Partial<{ groupId: string; substituteProfessorId: string; startsAt: string | null; endsAt: string | null; active: boolean; notes: string | null }>) => (await api.put<{ data: SubstituteAssignment }>(`/coordinacion/infraestructura/sustituciones/${id}`, input)).data,
  deleteSubstituteAssignment: async (id: string) => { await api.delete(`/coordinacion/infraestructura/sustituciones/${id}`); },
  sharedClassOptions: async () => (await api.get<{ data: { teachers: ProfessorOption[]; assignments: Assignment[] } }>('/coordinacion/clases-compartidas/opciones')).data,
  sharedClasses: async () => (await api.get<{ data: SharedClassAssignment[] }>('/coordinacion/clases-compartidas')).data,
  createSharedClass: async (input: { sourceAssignmentId: string; assignedTeacherId: string; schoolCycleYear: number; schoolCycleTerm: 1 | 2 | 3; active?: boolean; notes?: string | null }) => (await api.post<{ data: SharedClassAssignment }>('/coordinacion/clases-compartidas', input)).data,
  updateSharedClass: async (id: string, input: Partial<{ sourceAssignmentId: string; assignedTeacherId: string; schoolCycleYear: number; schoolCycleTerm: 1 | 2 | 3; active: boolean; notes: string | null }>) => (await api.put<{ data: SharedClassAssignment }>(`/coordinacion/clases-compartidas/${id}`, input)).data,
  deleteSharedClass: async (id: string) => { await api.delete(`/coordinacion/clases-compartidas/${id}`); },
};
