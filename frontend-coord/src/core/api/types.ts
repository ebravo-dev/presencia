export interface CoordinatorUser { id: string; email: string; name: string; role: string }
export interface SuperUser { role: 'SUPER_USER' }
export type DatabaseTargetId = 'integration' | 'identity' | 'academic' | 'attendance' | 'coordination-query';
export interface DatabaseTarget {
  id: DatabaseTargetId;
  name: string;
  description: string;
  confirmationPhrase: string;
  invalidatesSuperUserSession: boolean;
}
export interface DatabaseCatalogResponse {
  data: {
    databases: DatabaseTarget[];
    all: Omit<DatabaseTarget, 'id'> & { id: 'all' };
  };
  meta: { generatedAt: string };
}
export interface DatabasePurgeResponse {
  data: {
    purged: DatabaseTargetId[];
    purgedAt: string;
    sessionInvalidated: boolean;
  };
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
  meta: { mode: 'PRODUCTION' | 'DEMO' };
}
export interface CoordinatorAccount {
  id: string;
  email: string;
  name: string;
  role: string;
  disabledAt: string | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface CoordinationSummary { id: string; externalId: string; name: string; shortName: string | null; teacherCount: number; subjectCount: number; assignmentCount: number }
export interface TeacherSummary {
  id: string; externalId: string; institutionalCode: string | null; name: string; email: string | null;
  lastAuthenticatedAt: string; lastHarvestedAt: string | null; assignmentCount: number; subjectCount: number;
  coordinations: Array<{ id: string; externalId: string; name: string }>;
}
export interface ScheduleSlot { raw: string; startTime: string | null; endTime: string | null }
export type ScheduleDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type WeeklySchedule = Record<ScheduleDay, ScheduleSlot[]>;
export interface Assignment {
  id: string; externalGroupId: string; groupCode: string | null; schoolCycleExternalId: string; schoolCycleName: string | null;
  classroom: string | null; educationLevel: string | null; period: string | null; schedule: WeeklySchedule;
  firstSeenAt: string; lastSeenAt: string;
  teacher: { id: string; externalId: string; name: string };
  subject: { id: string; externalId: string; code: string | null; name: string };
  coordination: { id: string; externalId: string; name: string };
}
export interface OverviewResponse { data: { counts: { teachers: number; subjects: number; coordinations: number; assignments: number }; coordinations: CoordinationSummary[] }; meta: { generatedAt: string } }
export interface AttendanceSettingsResponse {
  data: {
    teacherAttendanceToleranceMinutes: number;
    updatedAt: string | null;
  };
}
export interface TeachersResponse { data: TeacherSummary[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }
export interface TeacherAssignmentsResponse { data: { teacher: TeacherSummary; assignments: Assignment[] }; meta: { generatedAt: string } }
export type ReportCellStatus = 'TAKEN' | 'LATE' | 'MISSING' | 'FUTURE' | 'NOT_SCHEDULED' | 'UNKNOWN_SCHEDULE' | 'SOURCE_UNAVAILABLE';
export type ReportDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
export interface ReportCell {
  date: string;
  status: ReportCellStatus;
  professorEntryAt: string | null;
  professorExitAt: string | null;
  actualClassroom?: string | null;
  scheduledHours: number;
  attendedHours: number;
  workedMinutes?: number;
  workedHours?: number;
  coverageRate: number | null;
  hourSlots: ReportHourSlot[];
  portalSyncStatus: string | null;
  portalSyncError: string | null;
}
export interface ReportHourSlot {
  index: number;
  startTime: string;
  endTime: string;
  status: ReportCellStatus;
}
export interface ReportRow {
  id: string; groupId: string; groupCode: string; grade?: string | null; subject: string; classroom: string | null; educationLevel: string | null;
  classroomsUsed?: string[];
  period: string; startTime: string | null; endTime: string | null; rawSchedule: string;
  completionRate: number | null;
  cells: Partial<Record<ReportDay, ReportCell>>;
}
export interface RangeReportRow {
  id: string; groupId: string; groupCode: string; grade: string | null; subject: string; classroom: string | null; educationLevel: string | null;
  classroomsUsed?: string[];
  period: string; startTime: string | null; endTime: string | null; rawSchedule: string;
  scheduledClassDays: number; reportedClassDays: number; attendanceRate: number | null;
}
export type ReportAvailability = 'READY' | 'NOT_SYNCED' | 'IDENTITY_UNAVAILABLE' | 'ATTENDANCE_SOURCE_UNAVAILABLE';
export interface ReportTeacher {
  id: string;
  name: string;
  email: string | null;
  institutionalCode?: string | null;
  coordinations?: Array<{ id: string; externalId: string; name: string }>;
}
export interface WeeklyReportResponse {
  data: {
    availability: ReportAvailability;
    teacher: ReportTeacher;
    week: { start: string; end: string; isoWeek: number };
    summary: { scheduled: number; taken: number; missing: number; future: number; unknownSchedule: number; sourceUnavailable?: number; completionRate: number };
    rows: ReportRow[];
  };
  meta: { generatedAt: string; timezone: string; teacherAttendanceToleranceMinutes?: number };
}
export interface RangeReportResponse {
  data: {
    mode: 'range';
    availability: ReportAvailability;
    teacher: ReportTeacher;
    range: { start: string; end: string };
    summary: { scheduledClassDays: number; reportedClassDays: number; missingClassDays: number; attendanceRate: number };
    rows: RangeReportRow[];
  };
  meta: { generatedAt: string; timezone: string; teacherAttendanceToleranceMinutes?: number };
}
export type AttendanceReportResponse = WeeklyReportResponse | RangeReportResponse;

export interface Beacon {
  id: string;
  classroom: string;
  classroomKey?: string;
  uuid: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentDeviceBinding {
  id: string;
  matricula: string;
  attendanceUuid: string;
  deviceBindingId: string | null;
  platform: string | null;
  deviceInfo: string | null;
  createdAt: string;
  updatedAt: string;
  students: Array<{
    id: string;
    matricula: string;
    name: string;
    group: {
      code: string;
      groupLetter: string;
      name: string;
      classroom: string;
      period: string;
      professor: { name: string; institutionalEmail: string };
    };
  }>;
}

export interface DebugStatusResponse {
  data: {
    enabled: boolean;
    period: string;
    settings: DebugSettings;
    apiRestPolicy: string;
  };
  meta: { generatedAt: string };
}

export interface DebugSettings {
  teacherAttendanceToleranceMinutes: number;
}

export interface DebugSettingsResponse {
  data: DebugSettings;
  meta: { generatedAt: string };
}

export interface DebugTeacher {
  id: string;
  externalId: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DebugStudent {
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

export interface RegisteredStudent {
  id: string;
  matricula: string;
  email: string | null;
  name: string;
  lastAuthenticatedAt: string;
}

export interface DebugCatalogResponse {
  data: {
    enabled: boolean;
    settings: DebugSettings;
    teachers: DebugTeacher[];
    students: DebugStudent[];
    classes: unknown[];
    attendanceWrites: unknown[];
    updatedAt: string;
  };
}

export type DebugScheduleSlotInput = { startTime: string; endTime: string };
export type DebugScheduleInput = Partial<Record<ScheduleDay, DebugScheduleSlotInput[]>>;

export interface DebugSynchronizationMeta {
  synchronization: {
    status: 'COMPLETED' | 'PENDING';
    attempts: number;
    error: string | null;
  };
}

export interface DebugMutationResponse<T> {
  data: T;
  meta?: DebugSynchronizationMeta;
}

export interface DebugClassResponse {
  data: Array<{
    id: string;
    externalGroupId: string;
    code: string;
    groupLetter: string;
    period: string;
    name: string;
    level: string;
    classroom: string;
    beaconUuid: string;
    schedule: Record<string, unknown>;
    professor: { id: string; name: string; institutionalEmail: string };
    students: Array<{ id: string; matricula: string; name: string; beaconUuid: string | null }>;
    attendanceRecords: Array<{
      id: string;
      date: string;
      professorEntryAt: string | null;
      professorExitAt: string | null;
      portalSyncStatus: string;
      portalSyncError: string | null;
      attendances: unknown[];
      studentBeaconDetections: unknown[];
    }>;
  }>;
  meta: { generatedAt: string };
}

export interface DebugStudentAttendanceResponse {
  data: Array<{
    id: string;
    date: string;
    professorEntryAt: string | null;
    professorExitAt: string | null;
    portalSyncStatus: string;
    portalSyncError: string | null;
    createdAt: string;
    professor: { id: string; name: string; institutionalEmail: string };
    group: { id: string; code: string; groupLetter: string; period: string; name: string; classroom: string };
    attendances: Array<{
      id: string;
      status: string;
      createdAt: string;
      student: { id: string; matricula: string; name: string; beaconUuid: string | null };
    }>;
    studentBeaconDetections: Array<{
      id: string;
      beaconUuid: string;
      detectedAt: string;
      rssi: number | null;
      bluetoothAddress: string | null;
      student: { id: string; matricula: string; name: string };
    }>;
  }>;
  meta: { generatedAt: string };
}

export interface DebugFlowLogsResponse {
  data: {
    syncJobs: Array<{
      id: string;
      status: string;
      currentGroupName: string | null;
      error: string | null;
      startedAt: string;
      completedAt: string | null;
      professor: { id: string; name: string; institutionalEmail: string };
    }>;
    attendanceRecords: Array<{
      id: string;
      date: string;
      professorEntryAt: string | null;
      professorExitAt: string | null;
      portalSyncStatus: string;
      portalSyncError: string | null;
      createdAt: string;
      professor: { id: string; name: string; institutionalEmail: string };
      group: { id: string; code: string; groupLetter: string; period: string; name: string; classroom: string };
      _count: { attendances: number; studentBeaconDetections: number };
    }>;
    recentBindings: StudentDeviceBinding[];
  };
  meta: { generatedAt: string };
}

export interface InfrastructureSummaryResponse {
  data: {
    counts: {
      beacons: number;
      studentDeviceBindings: number;
      studentBleAttendances: number;
      activeSubstitutions: number;
    };
    recentBindings: StudentDeviceBinding[];
    recentBeacons: Beacon[];
    recentSubstitutions: Array<{
      id: string;
      group: {
        name: string;
        groupLetter: string | null;
        classroom: string | null;
      };
      primaryProfessor: { name: string };
      substituteProfessor: { name: string };
    }>;
  };
  meta: { generatedAt: string };
}

export interface ProfessorOption {
  id: string;
  externalId?: string;
  institutionalCode?: string | null;
  name: string;
  institutionalEmail?: string;
  email?: string | null;
}

export interface SharedClassAssignment {
  id: string;
  sourceAssignmentId: string;
  assignedTeacherId: string;
  schoolCycleYear: number;
  schoolCycleTerm: 1 | 2 | 3;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  sourceAssignment: Assignment;
  assignedTeacher: ProfessorOption;
}
