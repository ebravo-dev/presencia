import { ApiError } from '../../errors/api-error.js';
import type { ScheduleSlot, WeeklySchedule } from '../../domain/entities/group.js';
import type { GroupAssignmentDetail, IGroupAssignmentRepository } from '../../domain/repositories/group-assignment.repository.js';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.js';
import {
  AttendanceBackendUnavailableError,
  type AttendanceBackendClient,
  type AttendanceSourceGroup,
  type AttendanceSourceRecord,
} from '../../infrastructure/http/client/attendance-backend.client.js';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type ReportDay = typeof DAYS[number];
type CellStatus = 'TAKEN' | 'MISSING' | 'FUTURE' | 'NOT_SCHEDULED' | 'UNKNOWN_SCHEDULE' | 'SOURCE_UNAVAILABLE';
type ReportAvailability = 'READY' | 'NOT_SYNCED' | 'IDENTITY_UNAVAILABLE' | 'ATTENDANCE_SOURCE_UNAVAILABLE';

interface ReportTeacher {
  id: string;
  name: string;
  email: string | null;
  institutionalCode?: string | null;
  coordinations?: Array<{ id: string; externalId: string; name: string }>;
}

interface ReportSourceGroup {
  id: string;
  code: string;
  groupLetter: string | null;
  name: string;
  level: string | null;
  classroom: string | null;
  schedule: unknown;
  period: string;
  attendanceRecords: AttendanceSourceRecord[];
}

export class WeeklyAttendanceReportService {
  constructor(
    private readonly teachers: ITeacherRepository,
    private readonly source: AttendanceBackendClient,
    private readonly localAssignments?: IGroupAssignmentRepository,
  ) {}

  async getReport(teacherId: string, weekStart: string) {
    const teacher = await this.teachers.findById(teacherId);
    if (!teacher) throw new ApiError(404, 'TEACHER_NOT_FOUND', `No existe el profesor ${teacherId}.`);
    const weekDates = DAYS.map((day, index) => ({ day, date: addDays(weekStart, index) }));
    const weekEnd = weekDates.at(-1)?.date ?? weekStart;
    const academicCycle = cycleForWeek(weekStart);
    if (!teacher.email) return emptyReport(teacher, weekStart, weekEnd, 'IDENTITY_UNAVAILABLE');

    let sourceProfessor;
    try {
      sourceProfessor = await this.source.getWeeklyAttendance({ professorEmail: teacher.email, startDate: weekStart, endDate: weekEnd });
    } catch (error) {
      if (error instanceof AttendanceBackendUnavailableError) {
        return this.getLocalScheduleReport(teacher, weekDates, weekStart, weekEnd, 'ATTENDANCE_SOURCE_UNAVAILABLE');
      }
      throw error;
    }
    if (!sourceProfessor) return emptyReport(teacher, weekStart, weekEnd, 'NOT_SYNCED');

    const rows = sourceProfessor.groups
      .filter((group) => matchesAcademicCycle(group.period, academicCycle))
      .flatMap((group) => buildRows(group, weekDates));
    return reportResponse(toReportTeacher(teacher), weekStart, weekEnd, 'READY', rows);
  }

  private async getLocalScheduleReport(
    teacher: ReportTeacher,
    weekDates: Array<{ day: ReportDay; date: string }>,
    weekStart: string,
    weekEnd: string,
    availability: ReportAvailability,
  ) {
    const assignments = await this.localAssignments?.findByTeacherId(teacher.id);
    if (!assignments?.length) return emptyReport(teacher, weekStart, weekEnd, availability);

    const academicCycle = cycleForWeek(weekStart);
    const rows = assignments
      .filter((assignment) => assignmentMatchesAcademicCycle(assignment, academicCycle))
      .flatMap((assignment) => buildRows(toLocalReportGroup(assignment), weekDates, true));
    return reportResponse(toReportTeacher(teacher), weekStart, weekEnd, availability, rows);
  }
}

function buildRows(
  group: ReportSourceGroup | AttendanceSourceGroup,
  dates: Array<{ day: ReportDay; date: string }>,
  sourceUnavailable = false,
) {
  const schedule = normalizeSchedule(group.schedule);
  const slots = DAYS.flatMap((day) => schedule[day]);
  if (slots.length === 0) return [];

  const cells = Object.fromEntries(dates.map(({ day, date }) => [
    day,
    buildCell(date, schedule[day], group.attendanceRecords, sourceUnavailable),
  ])) as Record<ReportDay, ReturnType<typeof buildCell>>;
  const displaySchedule = scheduleForDisplay(slots);

  return [{
    id: group.id,
    groupId: group.id, groupCode: group.groupLetter || group.code, subject: group.name,
    classroom: group.classroom || null, educationLevel: group.level || null, period: group.period,
    startTime: displaySchedule.startTime, endTime: displaySchedule.endTime, rawSchedule: displaySchedule.raw,
    cells,
    completionRate: completionRateForCells(cells),
  }];
}

function buildCell(
  date: string,
  slots: NormalizedSlot[],
  records: AttendanceSourceRecord[],
  sourceUnavailable = false,
) {
  if (slots.length === 0) return { date, status: 'NOT_SCHEDULED' as CellStatus, portalSyncStatus: null, portalSyncError: null };
  if (sourceUnavailable) {
    return { date, status: 'SOURCE_UNAVAILABLE' as CellStatus, portalSyncStatus: null, portalSyncError: null };
  }
  const parsedSlots = slots.filter((slot) => slot.startTime && slot.endTime);
  if (parsedSlots.length === 0) return { date, status: 'UNKNOWN_SCHEDULE' as CellStatus, portalSyncStatus: null, portalSyncError: null };
  const record = records.find((item) => item.date.slice(0, 10) === date);
  if (record) return { date, status: 'TAKEN' as CellStatus, portalSyncStatus: record.portalSyncStatus, portalSyncError: record.portalSyncError };
  const lastEndTime = parsedSlots.reduce((latest, slot) => slot.endTime! > latest ? slot.endTime! : latest, '00:00');
  const status: CellStatus = `${date}T${lastEndTime}` < currentLocalDateTime() ? 'MISSING' : 'FUTURE';
  return { date, status, portalSyncStatus: null, portalSyncError: null };
}

interface NormalizedSlot { key: string; raw: string; startTime: string | null; endTime: string | null }
function normalizeSchedule(value: unknown): Record<ReportDay, NormalizedSlot[]> {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const sourceKeys: Record<ReportDay, string[]> = {
    monday: ['monday', 'lunes'],
    tuesday: ['tuesday', 'martes'],
    wednesday: ['wednesday', 'miercoles', 'miércoles'],
    thursday: ['thursday', 'jueves'],
    friday: ['friday', 'viernes'],
    saturday: ['saturday', 'sabado', 'sábado'],
  };
  return Object.fromEntries(DAYS.map((day) => {
    const raw = sourceKeys[day].map((key) => record[key]).find((item) => item !== undefined);
    return [day, normalizeDaySlots(raw)];
  })) as Record<ReportDay, NormalizedSlot[]>;
}

function normalizeDaySlots(value: unknown): NormalizedSlot[] {
  if (typeof value === 'string') {
    return uniqueSlots(value.split(/[;\n]+/)
      .map((item) => item.trim())
      .filter((item) => item && !isEmptyScheduleMarker(item))
      .map(toNormalizedSlot));
  }

  if (Array.isArray(value)) {
    return uniqueSlots(value.map((item) => {
      if (typeof item === 'string') {
        const raw = item.trim();
        return raw && !isEmptyScheduleMarker(raw) ? toNormalizedSlot(raw) : null;
      }
      if (typeof item !== 'object' || item === null) return null;

      const record = item as Partial<ScheduleSlot>;
      const startTime = record.startTime ? padTime(record.startTime) : null;
      const endTime = record.endTime ? padTime(record.endTime) : null;
      const raw = record.raw?.trim() || (startTime && endTime ? `${startTime}-${endTime}` : null);
      if (!raw || isEmptyScheduleMarker(raw)) return null;
      return { raw, startTime, endTime, key: startTime && endTime ? `${startTime}-${endTime}` : `unknown:${raw}` };
    }).filter((item): item is NormalizedSlot => item !== null));
  }

  return [];
}

function toNormalizedSlot(item: string): NormalizedSlot {
  const match = item.match(/\b(\d{1,2}:\d{2})\s*(?:-|a)\s*(\d{1,2}:\d{2})\b/i);
  const startTime = match?.[1] ? padTime(match[1]) : null;
  const endTime = match?.[2] ? padTime(match[2]) : null;
  return { raw: item, startTime, endTime, key: startTime && endTime ? `${startTime}-${endTime}` : `unknown:${item}` };
}

function uniqueSlots(slots: NormalizedSlot[]): NormalizedSlot[] {
  return [...new Map(slots.map((slot) => [slot.key, slot])).values()];
}

function isEmptyScheduleMarker(value: string): boolean {
  return /^(?:-+|n\/?[ad]|no aplica|sin horario)$/i.test(value.trim());
}

function scheduleForDisplay(slots: NormalizedSlot[]): Pick<NormalizedSlot, 'raw' | 'startTime' | 'endTime'> {
  const unique = uniqueSlots(slots);
  const parsed = unique.filter((slot) => slot.startTime && slot.endTime);
  if (parsed.length === 1 && unique.length === 1) return parsed[0]!;

  const displaySlots = parsed.length > 0 ? parsed : unique;
  return {
    raw: displaySlots.map((slot) => slot.startTime && slot.endTime ? `${slot.startTime}-${slot.endTime}` : slot.raw).join(' / '),
    startTime: parsed.reduce<string | null>((earliest, slot) => !earliest || slot.startTime! < earliest ? slot.startTime! : earliest, null),
    endTime: null,
  };
}

function toLocalReportGroup(assignment: GroupAssignmentDetail): ReportSourceGroup {
  return {
    id: assignment.id,
    code: assignment.externalGroupId,
    groupLetter: assignment.groupCode,
    name: assignment.subject.name,
    level: assignment.educationLevel,
    classroom: assignment.classroom,
    schedule: assignment.schedule as WeeklySchedule,
    period: assignment.schoolCycleName ?? assignment.period ?? assignment.schoolCycleExternalId,
    attendanceRecords: [],
  };
}

function toReportTeacher(teacher: ReportTeacher): ReportTeacher {
  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    institutionalCode: teacher.institutionalCode,
    coordinations: teacher.coordinations,
  };
}

function reportResponse(
  teacher: ReportTeacher,
  weekStart: string,
  weekEnd: string,
  availability: ReportAvailability,
  rows: ReturnType<typeof buildRows>,
) {
  rows.sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99') || a.subject.localeCompare(b.subject));
  const cells = rows.flatMap((row) => Object.values(row.cells));
  const summary = {
    scheduled: cells.filter((cell) => !['NOT_SCHEDULED', 'UNKNOWN_SCHEDULE'].includes(cell.status)).length,
    taken: cells.filter((cell) => cell.status === 'TAKEN').length,
    missing: cells.filter((cell) => cell.status === 'MISSING').length,
    future: cells.filter((cell) => cell.status === 'FUTURE').length,
    unknownSchedule: cells.filter((cell) => cell.status === 'UNKNOWN_SCHEDULE').length,
    sourceUnavailable: cells.filter((cell) => cell.status === 'SOURCE_UNAVAILABLE').length,
    completionRate: 0,
  };
  summary.completionRate = summary.taken + summary.missing === 0 ? 0 : Math.round((summary.taken / (summary.taken + summary.missing)) * 100);
  return {
    data: {
      availability,
      teacher,
      week: { start: weekStart, end: weekEnd, isoWeek: isoWeekNumber(weekStart) },
      summary,
      rows,
    },
    meta: { generatedAt: new Date().toISOString(), timezone: 'America/Mexico_City' },
  };
}

function completionRateForCells(cells: Record<ReportDay, ReturnType<typeof buildCell>>): number | null {
  const values = Object.values(cells);
  const taken = values.filter((cell) => cell.status === 'TAKEN').length;
  const missing = values.filter((cell) => cell.status === 'MISSING').length;
  return taken + missing === 0 ? null : Math.round((taken / (taken + missing)) * 100);
}

function cycleForWeek(weekStart: string): string {
  const date = new Date(`${weekStart}T12:00:00.000Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const term = month <= 5 ? 1 : month <= 7 || (month === 8 && day <= 7) ? 2 : 3;
  return `${year}-${term}`;
}

function assignmentMatchesAcademicCycle(assignment: GroupAssignmentDetail, academicCycle: string): boolean {
  return [
    assignment.schoolCycleName,
    assignment.period,
    assignment.schoolCycleExternalId,
  ].some((value) => matchesAcademicCycle(value, academicCycle));
}

function matchesAcademicCycle(value: string | null | undefined, academicCycle: string): boolean {
  return normalizeAcademicCycle(value) === academicCycle;
}

function normalizeAcademicCycle(value: string | null | undefined): string | null {
  const match = value?.match(/\b(20\d{2})\s*[-,]\s*([123])\b/);
  return match?.[1] && match[2] ? `${match[1]}-${match[2]}` : null;
}

function currentLocalDateTime(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}
function padTime(value: string): string { const [hour, minute] = value.split(':'); return `${hour?.padStart(2, '0')}:${minute}`; }
function isoWeekNumber(date: string): number {
  const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1)); return Math.ceil((((value.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function emptyReport(teacher: ReportTeacher, start: string, end: string, availability: ReportAvailability) {
  return { data: { availability, teacher, week: { start, end, isoWeek: isoWeekNumber(start) }, summary: { scheduled: 0, taken: 0, missing: 0, future: 0, unknownSchedule: 0, sourceUnavailable: 0, completionRate: 0 }, rows: [] }, meta: { generatedAt: new Date().toISOString(), timezone: 'America/Mexico_City' } };
}
