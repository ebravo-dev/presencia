import type { CoordinationQueryRepository } from '../domain/query.repository.js';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type Day = typeof DAYS[number];
type CellStatus = 'TAKEN' | 'LATE' | 'MISSING' | 'FUTURE' | 'NOT_SCHEDULED' | 'UNKNOWN_SCHEDULE';
type ToleranceSource = number | (() => number | Promise<number>);
interface Slot { raw: string; startTime: string | null; endTime: string | null }
interface AttendanceRecord {
  attendanceSessionId: string; date: Date; professorEntryAt: Date | null; professorExitAt: Date | null;
  uploadStatus: string; uploadError: string | null;
}
interface GroupSource {
  id: string; externalGroupId: string; groupCode: string | null; schoolCycleExternalId: string;
  schoolCycleName: string | null; classroom: string | null; educationLevel: string | null; period: string | null;
  schedule: unknown; subject: { name: string }; attendanceRecords: AttendanceRecord[];
}
interface TeacherSource {
  teacher: { id: string; name: string; email: string | null; institutionalCode?: string | null; coordinations?: unknown[] };
  groups: GroupSource[];
}

export class CoordinationReportService {
  constructor(
    private readonly repository: CoordinationQueryRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly toleranceSource: ToleranceSource = 10,
  ) {}

  async weekly(teacherId: string, weekStart: string) {
    const toleranceMinutes = await this.currentToleranceMinutes();
    const weekEnd = addDays(weekStart, 5);
    const source = await this.repository.teacherReportSource(teacherId, weekStart, weekEnd) as TeacherSource | null;
    if (!source) return null;
    const dates = DAYS.map((day, index) => ({ day, date: addDays(weekStart, index) }));
    const cycle = cycleForDate(weekStart);
    const rows = source.groups
      .filter((group) => matchesCycle(group, new Set([cycle])))
      .flatMap((group) => this.weeklyRow(group, dates, toleranceMinutes));
    rows.sort((left, right) => (left.startTime ?? '99:99').localeCompare(right.startTime ?? '99:99') || left.subject.localeCompare(right.subject));
    const cells = rows.flatMap((row) => Object.values(row.cells));
    const hourSlots = cells.flatMap((cell) => cell.hourSlots);
    const taken = hourSlots.filter((slot) => slot.status === 'TAKEN' || slot.status === 'LATE').length;
    const missing = hourSlots.filter((slot) => slot.status === 'MISSING').length;
    const scheduled = hourSlots.filter((slot) => ['TAKEN', 'LATE', 'MISSING', 'FUTURE'].includes(slot.status)).length;
    return {
      data: {
        availability: source.groups.length > 0 ? 'READY' : 'NOT_SYNCED', teacher: source.teacher,
        week: { start: weekStart, end: weekEnd, isoWeek: isoWeekNumber(weekStart) },
        summary: {
          scheduled, taken, missing, future: cells.filter((cell) => cell.status === 'FUTURE').length,
          unknownSchedule: cells.filter((cell) => cell.status === 'UNKNOWN_SCHEDULE').length,
          sourceUnavailable: 0, completionRate: scheduled === 0 ? 0 : percentage(taken, scheduled),
        },
        rows,
      },
      meta: {
        generatedAt: this.now().toISOString(),
        timezone: 'America/Mexico_City',
        teacherAttendanceToleranceMinutes: toleranceMinutes,
      },
    };
  }

  async range(teacherId: string, startDate: string, endDate: string) {
    const toleranceMinutes = await this.currentToleranceMinutes();
    const source = await this.repository.teacherReportSource(teacherId, startDate, endDate) as TeacherSource | null;
    if (!source) return null;
    const dates = datesForRange(startDate, endDate);
    const cycles = new Set(dates.map(({ date }) => cycleForDate(date)));
    const rows = source.groups.filter((group) => matchesCycle(group, cycles)).map((group) => {
      const schedule = normalizeSchedule(group.schedule);
      const scheduled = dates.flatMap(({ day, date }) => hourlyBlocks(date, schedule[day]));
      const attended = scheduled.filter((block) => {
        const record = recordFor(group.attendanceRecords, block.date);
        return this.blockStatus(block, record, toleranceMinutes) === 'TAKEN'
          || this.blockStatus(block, record, toleranceMinutes) === 'LATE';
      }).length;
      const display = displaySchedule(DAYS.flatMap((day) => schedule[day]));
      const parts = groupParts(group.groupCode ?? '');
      return {
        id: group.id, groupId: group.id, groupCode: parts.group ?? group.groupCode ?? group.externalGroupId,
        grade: parts.grade, subject: group.subject.name, classroom: group.classroom,
        educationLevel: group.educationLevel, period: group.period ?? group.schoolCycleName ?? group.schoolCycleExternalId,
        startTime: display.startTime, endTime: display.endTime, rawSchedule: display.raw,
        scheduledClassDays: scheduled.length, reportedClassDays: attended,
        attendanceRate: scheduled.length === 0 ? null : percentage(attended, scheduled.length),
      };
    }).filter((row) => row.scheduledClassDays > 0);
    rows.sort((a, b) => a.subject.localeCompare(b.subject) || (a.grade ?? '').localeCompare(b.grade ?? '') || a.groupCode.localeCompare(b.groupCode));
    const scheduledClassDays = rows.reduce((sum, row) => sum + row.scheduledClassDays, 0);
    const reportedClassDays = rows.reduce((sum, row) => sum + row.reportedClassDays, 0);
    return {
      data: {
        mode: 'range', availability: source.groups.length > 0 ? 'READY' : 'NOT_SYNCED', teacher: source.teacher,
        range: { start: startDate, end: endDate },
        summary: {
          scheduledClassDays, reportedClassDays, missingClassDays: Math.max(0, scheduledClassDays - reportedClassDays),
          attendanceRate: scheduledClassDays === 0 ? 0 : percentage(reportedClassDays, scheduledClassDays),
        },
        rows,
      },
      meta: {
        generatedAt: this.now().toISOString(),
        timezone: 'America/Mexico_City',
        teacherAttendanceToleranceMinutes: toleranceMinutes,
      },
    };
  }

  private weeklyRow(
    group: GroupSource,
    dates: Array<{ day: Day; date: string }>,
    toleranceMinutes: number,
  ) {
    const schedule = normalizeSchedule(group.schedule);
    const allSlots = DAYS.flatMap((day) => schedule[day]);
    if (allSlots.length === 0) return [];
    const cells = Object.fromEntries(dates.map(({ day, date }) => {
      const slots = schedule[day];
      if (slots.length === 0) return [day, emptyCell(date, 'NOT_SCHEDULED')];
      const blocks = hourlyBlocks(date, slots);
      if (blocks.length === 0) return [day, emptyCell(date, 'UNKNOWN_SCHEDULE')];
      const record = recordFor(group.attendanceRecords, date);
      const workedMinutes = presenceMinutes(blocks, record, this.now());
      const hourSlots = blocks.map((block, index) => ({
        index,
        startTime: block.startTime,
        endTime: block.endTime,
        status: this.blockStatus(block, record, toleranceMinutes),
      }));
      const attended = hourSlots.filter(({ status }) => status === 'TAKEN' || status === 'LATE').length;
      const status: CellStatus = attended > 0 ? 'TAKEN' : hourSlots.some((slot) => slot.status === 'FUTURE') ? 'FUTURE' : 'MISSING';
      return [day, {
        date, status, professorEntryAt: record?.professorEntryAt?.toISOString() ?? null,
        professorExitAt: record?.professorExitAt?.toISOString() ?? null,
        scheduledHours: blocks.length, attendedHours: attended,
        workedMinutes, workedHours: Math.round((workedMinutes / 60) * 100) / 100,
        coverageRate: percentage(attended, blocks.length), hourSlots,
        portalSyncStatus: record?.uploadStatus ?? null, portalSyncError: record?.uploadError ?? null,
      }];
    })) as Record<Day, ReturnType<typeof emptyCell>>;
    const display = displaySchedule(allSlots);
    const parts = groupParts(group.groupCode ?? '');
    const hourSlots = Object.values(cells).flatMap((cell) => cell.hourSlots);
    const scheduled = hourSlots.filter((slot) => ['TAKEN', 'LATE', 'MISSING', 'FUTURE'].includes(slot.status)).length;
    const attended = hourSlots.filter((slot) => slot.status === 'TAKEN' || slot.status === 'LATE').length;
    return [{
      id: group.id, groupId: group.id, groupCode: parts.group ?? group.groupCode ?? group.externalGroupId,
      grade: parts.grade, subject: group.subject.name, classroom: group.classroom,
      educationLevel: group.educationLevel, period: group.period ?? group.schoolCycleName ?? group.schoolCycleExternalId,
      startTime: display.startTime, endTime: display.endTime, rawSchedule: display.raw,
      cells, completionRate: scheduled === 0 ? null : percentage(attended, scheduled),
    }];
  }

  private blockStatus(
    block: HourBlock,
    record: AttendanceRecord | undefined,
    toleranceMinutes: number,
  ): CellStatus {
    if (!record?.professorEntryAt) return block.end < this.now() ? 'MISSING' : 'FUTURE';
    const exit = record.professorExitAt ?? this.now();
    if (exit <= record.professorEntryAt) return block.end < this.now() ? 'MISSING' : 'FUTURE';
    const overlaps = exit > block.start && record.professorEntryAt < block.end;
    if (!overlaps) return block.end < this.now() ? 'MISSING' : 'FUTURE';
    const onTime = record.professorEntryAt.getTime() <= block.start.getTime() + toleranceMinutes * 60_000;
    return onTime && exit >= block.end ? 'TAKEN' : 'LATE';
  }

  private async currentToleranceMinutes() {
    try {
      const value = typeof this.toleranceSource === 'function'
        ? await this.toleranceSource()
        : this.toleranceSource;
      return Math.max(0, Math.min(120, Math.round(value)));
    } catch {
      return 10;
    }
  }
}

interface HourBlock { date: string; start: Date; end: Date; startTime: string; endTime: string }
function normalizeSchedule(value: unknown): Record<Day, Slot[]> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const aliases: Record<Day, string[]> = {
    monday: ['monday', 'lunes'], tuesday: ['tuesday', 'martes'], wednesday: ['wednesday', 'miercoles', 'miércoles'],
    thursday: ['thursday', 'jueves'], friday: ['friday', 'viernes'], saturday: ['saturday', 'sabado', 'sábado'],
  };
  return Object.fromEntries(DAYS.map((day) => [day, normalizeSlots(aliases[day].map((key) => source[key]).find((item) => item !== undefined))])) as Record<Day, Slot[]>;
}
function normalizeSlots(value: unknown): Slot[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;\n]+/) : [];
  const slots = items.flatMap((item) => {
    if (typeof item === 'string') return [slotFromText(item)];
    if (!item || typeof item !== 'object') return [];
    const source = item as Partial<Slot>;
    const raw = source.raw?.trim() || (source.startTime && source.endTime ? `${source.startTime}-${source.endTime}` : '');
    return raw ? [{ raw, startTime: source.startTime ? padTime(source.startTime) : null, endTime: source.endTime ? padTime(source.endTime) : null }] : [];
  }).filter((slot) => slot.raw && !/^(?:-+|n\/?a|sin horario)$/i.test(slot.raw));
  return mergeConsecutiveSlots(slots);
}
function mergeConsecutiveSlots(slots: Slot[]): Slot[] {
  const timed = slots.filter((slot) => slot.startTime && slot.endTime).sort((left, right) => left.startTime!.localeCompare(right.startTime!));
  const merged: Slot[] = [];
  for (const slot of timed) {
    const previous = merged.at(-1);
    if (!previous || slot.startTime! > previous.endTime!) {
      merged.push({ ...slot });
      continue;
    }
    if (slot.endTime! > previous.endTime!) previous.endTime = slot.endTime;
    previous.raw = `${previous.startTime}-${previous.endTime}`;
  }
  return [...merged, ...slots.filter((slot) => !slot.startTime || !slot.endTime)];
}
function slotFromText(rawInput: string): Slot {
  const raw = rawInput.trim();
  const match = raw.match(/\b(\d{1,2}:\d{2})\s*(?:-|a)\s*(\d{1,2}:\d{2})\b/i);
  return { raw, startTime: match?.[1] ? padTime(match[1]) : null, endTime: match?.[2] ? padTime(match[2]) : null };
}
function hourlyBlocks(dateValue: string, slots: Slot[]): HourBlock[] {
  return slots.flatMap((slot) => {
    if (!slot.startTime || !slot.endTime) return [];
    const start = localDateTime(dateValue, slot.startTime);
    let end = localDateTime(dateValue, slot.endTime);
    if (end <= start) end = new Date(end.getTime() + 86_400_000);
    const blocks: HourBlock[] = [];
    for (let cursor = start; cursor < end;) {
      const blockEnd = new Date(Math.min(end.getTime(), cursor.getTime() + 3_600_000));
      blocks.push({ date: dateValue, start: cursor, end: blockEnd, startTime: mexicoTime(cursor), endTime: mexicoTime(blockEnd) });
      cursor = blockEnd;
    }
    return blocks;
  });
}
function emptyCell(dateValue: string, status: CellStatus) {
  return { date: dateValue, status, professorEntryAt: null, professorExitAt: null, scheduledHours: 0, attendedHours: 0, workedMinutes: 0, workedHours: 0, coverageRate: null, hourSlots: [] as Array<{ index: number; startTime: string; endTime: string; status: CellStatus }>, portalSyncStatus: null, portalSyncError: null };
}
function presenceMinutes(blocks: HourBlock[], record: AttendanceRecord | undefined, now: Date) {
  if (!record?.professorEntryAt) return 0;
  const exit = record.professorExitAt ?? now;
  if (exit <= record.professorEntryAt) return 0;
  const milliseconds = blocks.reduce((total, block) => {
    const start = Math.max(block.start.getTime(), record.professorEntryAt!.getTime());
    const end = Math.min(block.end.getTime(), exit.getTime());
    return total + Math.max(0, end - start);
  }, 0);
  return Math.round(milliseconds / 60_000);
}
function displaySchedule(slots: Slot[]) {
  const valid = slots.filter((slot) => slot.startTime && slot.endTime);
  return {
    raw: valid.map((slot) => `${slot.startTime}-${slot.endTime}`).join(' / ') || slots.map(({ raw }) => raw).join(' / '),
    startTime: valid.map(({ startTime }) => startTime!).sort()[0] ?? null,
    endTime: valid.length === 1 ? valid[0]!.endTime : null,
  };
}
function recordFor(records: AttendanceRecord[], dateValue: string) { return records.find((record) => record.date.toISOString().slice(0, 10) === dateValue); }
function matchesCycle(group: GroupSource, cycles: Set<string>) {
  const normalized = normalizeCycle(group.schoolCycleName) ?? normalizeCycle(group.period) ?? normalizeCycle(group.schoolCycleExternalId);
  return normalized ? cycles.has(normalized) : true;
}
function normalizeCycle(value?: string | null) { const match = value?.match(/\b(20\d{2})\s*[-,]\s*([123])\b/); return match ? `${match[1]}-${match[2]}` : null; }
function cycleForDate(value: string) { const dateValue = new Date(`${value}T12:00:00Z`); const month = dateValue.getUTCMonth() + 1; const term = month <= 5 ? 1 : month <= 7 ? 2 : 3; return `${dateValue.getUTCFullYear()}-${term}`; }
function datesForRange(start: string, end: string) { const values: Array<{ day: Day; date: string }> = []; for (let value = start; value <= end; value = addDays(value, 1)) { const day = DAYS[new Date(`${value}T12:00:00Z`).getUTCDay() - 1]; if (day) values.push({ day, date: value }); } return values; }
function addDays(value: string, amount: number) { const dateValue = new Date(`${value}T12:00:00Z`); dateValue.setUTCDate(dateValue.getUTCDate() + amount); return dateValue.toISOString().slice(0, 10); }
function localDateTime(dateValue: string, time: string) { return new Date(`${dateValue}T${time}:00.000-06:00`); }
function mexicoTime(value: Date) { return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }).format(value); }
function padTime(value: string) { const [hour, minute] = value.split(':'); return `${hour?.padStart(2, '0')}:${minute}`; }
function percentage(value: number, total: number) { return total === 0 ? 0 : Math.round((value / total) * 10_000) / 100; }
function isoWeekNumber(value: string) { const dateValue = new Date(`${value}T00:00:00Z`); dateValue.setUTCDate(dateValue.getUTCDate() + 4 - (dateValue.getUTCDay() || 7)); const year = new Date(Date.UTC(dateValue.getUTCFullYear(), 0, 1)); return Math.ceil((((dateValue.getTime() - year.getTime()) / 86_400_000) + 1) / 7); }
function groupParts(value: string) { const match = value.trim().match(/^(\d+)\s*[-\s]\s*([A-Za-z]+)$/); return { grade: match?.[1] ?? null, group: match?.[2]?.toUpperCase() ?? null }; }
