import { api, superApi } from './client';
import type { ActiveAcademicCycleResponse, Assignment, AttendanceSettingsResponse, Beacon, CoordinatorAccount, CoordinatorUser, DatabaseCatalogResponse, DatabasePurgeResponse, DatabaseTargetId, DebugCatalogResponse, DebugClassResponse, DebugFlowLogsResponse, DebugMutationResponse, DebugScheduleInput, DebugSettingsResponse, DebugStatusResponse, DebugStudent, DebugStudentAttendanceResponse, DebugTeacher, InfrastructureSummaryResponse, OverviewResponse, ProfessorOption, RangeReportResponse, RegisteredStudent, SharedClassAssignment, StudentDeviceBinding, SuperUser, TeacherAssignmentsResponse, TeachersResponse, WeeklyReportResponse } from './types';

export const coordinationApi = {
  login: async (input: { email: string; password: string }) => (await api.post<{ data: { user: CoordinatorUser; expiresAt: string } }>('/coordinacion/auth/login', input)).data,
  me: async () => (await api.get<{ data: { user: CoordinatorUser } }>('/coordinacion/auth/me')).data,
  logout: async () => { await api.post('/coordinacion/auth/logout'); },
  overview: async () => (await api.get<OverviewResponse>('/coordinacion/resumen')).data,
  attendanceSettings: async () => (await api.get<AttendanceSettingsResponse>('/coordinacion/configuracion/asistencia')).data,
  updateAttendanceSettings: async (input: { teacherAttendanceToleranceMinutes: number }) => (await api.put<AttendanceSettingsResponse>('/coordinacion/configuracion/asistencia', input)).data,
  infrastructureSummary: async () => (await api.get<InfrastructureSummaryResponse>('/coordinacion/infraestructura/resumen')).data,
  studentDeviceBindings: async (params: { q?: string }) => (await api.get<{ data: StudentDeviceBinding[] }>('/coordinacion/infraestructura/alumnos-vinculados', { params })).data,
  authorizeStudentDeviceChange: async (matricula: string) => { await api.delete(`/coordinacion/infraestructura/alumnos-vinculados/${encodeURIComponent(matricula)}`); },
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
  databases: async () => (await superApi.get<DatabaseCatalogResponse>('/superUsuario/bases-datos')).data,
  purgeDatabase: async (input: { target: DatabaseTargetId | 'all'; confirmation: string }) => (
    await superApi.post<DatabasePurgeResponse>('/superUsuario/bases-datos/borrar', input, { timeout: 60_000 })
  ).data,
  activeAcademicCycle: async () => (await superApi.get<ActiveAcademicCycleResponse>('/superUsuario/ciclo-escolar')).data,
  changeActiveAcademicCycle: async (cycleExternalId: number) => (
    await superApi.put<ActiveAcademicCycleResponse>('/superUsuario/ciclo-escolar', { cycleExternalId })
  ).data,
  coordinators: async () => (await superApi.get<{ data: CoordinatorAccount[]; meta: { generatedAt: string } }>('/superUsuario/coordinadores')).data,
  createCoordinator: async (input: { email: string; name: string; password: string; role: string }) => (await superApi.post<{ data: CoordinatorAccount }>('/superUsuario/coordinadores', input)).data,
  updateCoordinator: async (id: string, input: Partial<{ email: string; name: string; password: string; role: string; disabled: boolean }>) => (await superApi.put<{ data: CoordinatorAccount }>(`/superUsuario/coordinadores/${id}`, input)).data,
  deleteCoordinator: async (id: string) => { await superApi.delete(`/superUsuario/coordinadores/${id}`); },
  beacons: async () => (await superApi.get<{ data: Beacon[] }>('/superUsuario/beacons')).data,
  createBeacon: async (input: { classroom: string; uuid: string }) => (await superApi.post<{ data: Beacon }>('/superUsuario/beacons', input)).data,
  updateBeacon: async (id: string, input: Partial<{ classroom: string; uuid: string }>) => (await superApi.put<{ data: Beacon }>(`/superUsuario/beacons/${id}`, input)).data,
  deleteBeacon: async (id: string) => { await superApi.delete(`/superUsuario/beacons/${id}`); },
  studentDeviceBindings: async (params: { q?: string }) => (await superApi.get<{ data: StudentDeviceBinding[] }>('/superUsuario/alumnos-vinculados', { params })).data,
  createStudentDeviceBinding: async (input: { matricula: string; attendanceUuid: string }) => (
    await superApi.post<{ data: StudentDeviceBinding }>('/superUsuario/alumnos-vinculados', input)
  ).data,
  deleteStudentDeviceBinding: async (matricula: string) => { await superApi.delete(`/superUsuario/alumnos-vinculados/${encodeURIComponent(matricula)}`); },
  debugStatus: async () => (await superApi.get<DebugStatusResponse>('/superUsuario/debug/status')).data,
  debugCatalog: async () => (await superApi.get<DebugCatalogResponse>('/superUsuario/debug/catalog')).data,
  debugRegisteredStudents: async () => (await superApi.get<{ data: RegisteredStudent[]; meta: { generatedAt: string } }>('/superUsuario/debug/registered-students')).data,
  createDebugTeacher: async (input: { email: string; name: string; password: string }) => (await superApi.post<DebugMutationResponse<DebugTeacher>>('/superUsuario/debug/teachers', input)).data,
  updateDebugTeacher: async (id: string, input: Partial<{ email: string; name: string; password: string }>) => (await superApi.put<DebugMutationResponse<DebugTeacher>>(`/superUsuario/debug/teachers/${id}`, input)).data,
  deleteDebugTeacher: async (id: string) => (await superApi.delete<DebugMutationResponse<{ deleted: true }> | undefined>(`/superUsuario/debug/teachers/${id}`)).data,
  createDebugStudent: async (input: { matricula: string; email: string; name: string; password: string; attendanceUuid?: string; careerName?: string }) => (await superApi.post<DebugMutationResponse<DebugStudent>>('/superUsuario/debug/students', input)).data,
  updateDebugStudent: async (id: string, input: Partial<{ matricula: string; email: string; name: string; password: string; attendanceUuid: string; careerName: string }>) => (await superApi.put<DebugMutationResponse<DebugStudent>>(`/superUsuario/debug/students/${id}`, input)).data,
  deleteDebugStudent: async (id: string) => (await superApi.delete<DebugMutationResponse<{ deleted: true }> | undefined>(`/superUsuario/debug/students/${id}`)).data,
  debugSettings: async () => (await superApi.get<DebugSettingsResponse>('/superUsuario/debug/settings')).data,
  updateDebugSettings: async (input: { teacherAttendanceToleranceMinutes: number }) => (await superApi.put<DebugSettingsResponse>('/superUsuario/debug/settings', input)).data,
  debugClasses: async () => (await superApi.get<DebugClassResponse>('/superUsuario/debug/classes')).data,
  createDebugClass: async (input: {
    professorEmail: string;
    professorName?: string;
    code?: string;
    groupLetter?: string;
    period?: string;
    name?: string;
    level?: string;
    classroom?: string;
    beaconUuid?: string;
    schedule?: DebugScheduleInput;
  }) => (await superApi.post<DebugMutationResponse<DebugClassResponse['data'][number]>>('/superUsuario/debug/classes', input)).data,
  updateDebugClass: async (id: string, input: Partial<{
    code: string;
    groupLetter: string;
    period: string;
    name: string;
    level: string;
    classroom: string;
    beaconUuid: string;
    schedule: DebugScheduleInput;
  }>) => (await superApi.put<DebugMutationResponse<DebugClassResponse['data'][number]>>(`/superUsuario/debug/classes/${id}`, input)).data,
  deleteDebugClass: async (id: string) => (await superApi.delete<DebugMutationResponse<{ deleted: true }> | undefined>(`/superUsuario/debug/classes/${id}`)).data,
  addDebugStudentToClass: async (classId: string, studentId: string) => (await superApi.post<DebugMutationResponse<unknown>>(`/superUsuario/debug/classes/${classId}/students`, { studentId })).data,
  addRegisteredStudentToDebugClass: async (classId: string, matricula: string) => (
    await superApi.post<DebugMutationResponse<unknown>>(`/superUsuario/debug/classes/${classId}/registered-students`, { matricula })
  ).data,
  removeDebugStudentFromClass: async (classId: string, studentId: string) => (await superApi.delete<DebugMutationResponse<{ deleted: true }> | undefined>(`/superUsuario/debug/classes/${classId}/students/${studentId}`)).data,
  synchronizeDebugCatalog: async () => (await superApi.post<{ data: { teachers: number; students: number; classes: number } }>('/superUsuario/debug/synchronize')).data,
  resetDebugData: async () => (await superApi.delete<{ data: {
    reset: boolean;
    deleted: { teachers: number; students: number; classes: number; attendanceWrites: number; identities: number; teacherSessions: number; studentSessions: number };
    resetAt: string;
  } }>('/superUsuario/debug/data', { data: { confirmation: 'BORRAR DEMO' }, timeout: 60_000 })).data,
  simulateDebugAttendance: async (classId: string, input: {
    date: string;
    entries: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' }>;
  }) => (await superApi.post(`/superUsuario/debug/classes/${classId}/simulate-attendance`, input)).data,
  debugStudentAttendance: async () => (await superApi.get<DebugStudentAttendanceResponse>('/superUsuario/debug/student-attendance')).data,
  debugFlowLogs: async () => (await superApi.get<DebugFlowLogsResponse>('/superUsuario/debug/flow-logs')).data,
};
