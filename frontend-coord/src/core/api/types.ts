export interface CoordinatorUser { id: string; email: string; name: string; role: string }
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
export interface TeachersResponse { data: TeacherSummary[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }
export interface TeacherAssignmentsResponse { data: { teacher: TeacherSummary; assignments: Assignment[] }; meta: { generatedAt: string } }
export type ReportCellStatus = 'TAKEN' | 'MISSING' | 'FUTURE' | 'NOT_SCHEDULED' | 'UNKNOWN_SCHEDULE' | 'SOURCE_UNAVAILABLE';
export type ReportDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
export interface ReportCell { date: string; status: ReportCellStatus; portalSyncStatus: string | null; portalSyncError: string | null }
export interface ReportRow {
  id: string; groupId: string; groupCode: string; subject: string; classroom: string | null; educationLevel: string | null;
  period: string; startTime: string | null; endTime: string | null; rawSchedule: string;
  completionRate: number | null;
  cells: Partial<Record<ReportDay, ReportCell>>;
}
export interface WeeklyReportResponse {
  data: {
    availability: 'READY' | 'NOT_SYNCED' | 'IDENTITY_UNAVAILABLE' | 'ATTENDANCE_SOURCE_UNAVAILABLE';
    teacher: {
      id: string;
      name: string;
      email: string | null;
      institutionalCode?: string | null;
      coordinations?: Array<{ id: string; externalId: string; name: string }>;
    };
    week: { start: string; end: string; isoWeek: number };
    summary: { scheduled: number; taken: number; missing: number; future: number; unknownSchedule: number; sourceUnavailable?: number; completionRate: number };
    rows: ReportRow[];
  };
  meta: { generatedAt: string; timezone: string };
}

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

export interface ProfessorOption {
  id: string;
  externalId?: string;
  institutionalCode?: string | null;
  name: string;
  institutionalEmail?: string;
  email?: string | null;
}

export interface GroupOption {
  id: string;
  code: string;
  groupLetter: string;
  period: string;
  name: string;
  classroom: string;
  professor: ProfessorOption;
}

export interface SubstituteAssignment {
  id: string;
  groupId: string;
  primaryProfessorId: string;
  substituteProfessorId: string;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  group: Omit<GroupOption, 'professor'> & { schedule: unknown };
  primaryProfessor: ProfessorOption;
  substituteProfessor: ProfessorOption;
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

export interface InfrastructureSummaryResponse {
  data: {
    counts: {
      beacons: number;
      studentDeviceBindings: number;
      studentBleAttendances: number;
      activeSubstitutions: number;
    };
    recentBindings: StudentDeviceBinding[];
    recentSubstitutions: SubstituteAssignment[];
    recentBeacons: Beacon[];
  };
  meta: { generatedAt: string };
}
