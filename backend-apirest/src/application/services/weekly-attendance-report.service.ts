import { ApiError } from '../../errors/api-error.js';
import type { ITeacherRepository } from '../../domain/repositories/teacher.repository.js';
import {
  AttendanceBackendUnavailableError,
  type AttendanceBackendClient,
  type AttendanceSourceGroup,
  type AttendanceSourceRecord,
} from '../../infrastructure/http/client/attendance-backend.client.js';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday'] as const;
type ReportDay = typeof DAYS[number];
type CellStatus = 'TAKEN' | 'MISSING' | 'FUTURE' | 'NOT_SCHEDULED' | 'UNKNOWN_SCHEDULE';

export class WeeklyAttendanceReportService {
  constructor(private readonly teachers: ITeacherRepository, private readonly source: AttendanceBackendClient) {}

  async getReport(teacherId: string, weekStart: string) {
    const teacher = await this.teachers.findById(teacherId);
    if (!teacher) throw new ApiError(404, 'TEACHER_NOT_FOUND', `No existe el profesor ${teacherId}.`);
    const weekDates = DAYS.map((day, index) => ({ day, date: addDays(weekStart, index) }));
    const weekEnd = weekDates.at(-1)?.date ?? weekStart;
    if (!teacher.email) return emptyReport(teacher, weekStart, weekEnd, 'IDENTITY_UNAVAILABLE');

    let sourceProfessor;
    try {
      sourceProfessor = await this.source.getWeeklyAttendance({ professorEmail: teacher.email, startDate: weekStart, endDate: weekEnd });
    } catch (error) {
      if (error instanceof AttendanceBackendUnavailableError) {
        throw new ApiError(503, 'ATTENDANCE_SOURCE_UNAVAILABLE', error.message);
      }
      throw error;
    }
    if (!sourceProfessor) return emptyReport(teacher, weekStart, weekEnd, 'NOT_SYNCED');

    const rows = sourceProfessor.groups.flatMap((group) => buildRows(group, weekDates));
    rows.sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99') || a.subject.localeCompare(b.subject));
    const cells = rows.flatMap((row) => Object.values(row.cells));
    const summary = {
      scheduled: cells.filter((cell) => !['NOT_SCHEDULED', 'UNKNOWN_SCHEDULE'].includes(cell.status)).length,
      taken: cells.filter((cell) => cell.status === 'TAKEN').length,
      missing: cells.filter((cell) => cell.status === 'MISSING').length,
      future: cells.filter((cell) => cell.status === 'FUTURE').length,
      unknownSchedule: cells.filter((cell) => cell.status === 'UNKNOWN_SCHEDULE').length,
      completionRate: 0,
    };
    summary.completionRate = summary.taken + summary.missing === 0 ? 0 : Math.round((summary.taken / (summary.taken + summary.missing)) * 100);
    return {
      data: {
        availability: 'READY', teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
        week: { start: weekStart, end: weekEnd, isoWeek: isoWeekNumber(weekStart) }, summary, rows,
      },
      meta: { generatedAt: new Date().toISOString(), timezone: 'America/Mexico_City' },
    };
  }
}

function buildRows(group: AttendanceSourceGroup, dates: Array<{ day: ReportDay; date: string }>) {
  const schedule = normalizeSourceSchedule(group.schedule);
  const ranges = new Map<string, NormalizedSlot>();
  for (const day of DAYS) for (const slot of schedule[day]) ranges.set(slot.key, slot);
  return [...ranges.values()].map((range) => ({
    id: `${group.id}:${range.key ?? range.raw}`,
    groupId: group.id, groupCode: group.groupLetter || group.code, subject: group.name,
    classroom: group.classroom || null, educationLevel: group.level || null, period: group.period,
    startTime: range.startTime, endTime: range.endTime, rawSchedule: range.raw,
    cells: Object.fromEntries(dates.map(({ day, date }) => {
      const slot = schedule[day].find((candidate) => candidate.key === range.key);
      return [day, buildCell(date, slot, group.attendanceRecords)];
    })) as Record<ReportDay, ReturnType<typeof buildCell>>,
  }));
}

function buildCell(date: string, slot: NormalizedSlot | undefined, records: AttendanceSourceRecord[]) {
  if (!slot) return { date, status: 'NOT_SCHEDULED' as CellStatus, portalSyncStatus: null, portalSyncError: null };
  if (!slot.startTime || !slot.endTime) return { date, status: 'UNKNOWN_SCHEDULE' as CellStatus, portalSyncStatus: null, portalSyncError: null };
  const record = records.find((item) => item.date.slice(0, 10) === date);
  if (record) return { date, status: 'TAKEN' as CellStatus, portalSyncStatus: record.portalSyncStatus, portalSyncError: record.portalSyncError };
  const status: CellStatus = `${date}T${slot.endTime}` < currentLocalDateTime() ? 'MISSING' : 'FUTURE';
  return { date, status, portalSyncStatus: null, portalSyncError: null };
}

interface NormalizedSlot { key: string; raw: string; startTime: string | null; endTime: string | null }
function normalizeSourceSchedule(value: unknown): Record<ReportDay, NormalizedSlot[]> {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const sourceKeys: Record<ReportDay, string> = { monday: 'lunes', tuesday: 'martes', wednesday: 'miercoles', thursday: 'jueves' };
  return Object.fromEntries(DAYS.map((day) => {
    const raw = record[sourceKeys[day]];
    const values = typeof raw === 'string' ? raw.split(/[;\n]+/).map((item) => item.trim()).filter(Boolean) : [];
    return [day, values.map((item) => {
      const match = item.match(/\b(\d{1,2}:\d{2})\s*(?:-|a)\s*(\d{1,2}:\d{2})\b/i);
      const startTime = match?.[1] ? padTime(match[1]) : null;
      const endTime = match?.[2] ? padTime(match[2]) : null;
      return { raw: item, startTime, endTime, key: startTime && endTime ? `${startTime}-${endTime}` : `unknown:${item}` };
    })];
  })) as Record<ReportDay, NormalizedSlot[]>;
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
function emptyReport(teacher: { id: string; name: string; email: string | null }, start: string, end: string, availability: string) {
  return { data: { availability, teacher, week: { start, end, isoWeek: isoWeekNumber(start) }, summary: { scheduled: 0, taken: 0, missing: 0, future: 0, unknownSchedule: 0, completionRate: 0 }, rows: [] }, meta: { generatedAt: new Date().toISOString(), timezone: 'America/Mexico_City' } };
}
