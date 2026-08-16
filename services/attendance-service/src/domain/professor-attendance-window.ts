export type ProfessorArrivalStatus = 'ON_TIME' | 'LATE' | 'OUTSIDE_WINDOW' | 'UNKNOWN_SCHEDULE';

interface ScheduleRange {
  startMinute: number;
  endMinute: number;
}

const DAY_ALIASES: Record<string, string[]> = {
  monday: ['monday', 'lunes'],
  tuesday: ['tuesday', 'martes'],
  wednesday: ['wednesday', 'miercoles', 'miércoles'],
  thursday: ['thursday', 'jueves'],
  friday: ['friday', 'viernes'],
  saturday: ['saturday', 'sabado', 'sábado'],
  sunday: ['sunday', 'domingo'],
};

export function classifyProfessorArrival(input: {
  schedule: unknown;
  observedAt: Date;
  timeZone: string;
  toleranceMinutes: number;
}): ProfessorArrivalStatus {
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: input.timeZone,
    weekday: 'long',
  }).format(input.observedAt).toLowerCase();
  const ranges = scheduleRangesForDay(input.schedule, day);
  if (ranges.length === 0) return 'UNKNOWN_SCHEDULE';

  const arrivalMinute = localMinuteOfDay(input.observedAt, input.timeZone);
  const tolerance = Math.max(0, Math.min(120, Math.round(input.toleranceMinutes)));
  for (const range of ranges) {
    const windowStart = range.startMinute - tolerance;
    const onTimeEnd = range.startMinute + tolerance;
    const windowEnd = range.endMinute + tolerance;
    if (arrivalMinute < windowStart || arrivalMinute > windowEnd) continue;
    return arrivalMinute <= onTimeEnd ? 'ON_TIME' : 'LATE';
  }
  return 'OUTSIDE_WINDOW';
}

function scheduleRangesForDay(schedule: unknown, day: string): ScheduleRange[] {
  if (!schedule || typeof schedule !== 'object') return [];
  const source = schedule as Record<string, unknown>;
  const value = (DAY_ALIASES[day] ?? [day])
    .map((key) => source[key])
    .find((candidate) => candidate !== undefined);
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[;\n·]+/)
      : [];
  const ranges = items.flatMap((item) => {
    if (typeof item === 'string') return parseRange(item);
    if (!item || typeof item !== 'object') return [];
    const slot = item as Record<string, unknown>;
    const raw = typeof slot.raw === 'string'
      ? slot.raw
      : typeof slot.startTime === 'string' && typeof slot.endTime === 'string'
        ? `${slot.startTime}-${slot.endTime}`
        : '';
    return parseRange(raw);
  }).sort((left, right) => left.startMinute - right.startMinute);

  const merged: ScheduleRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous || range.startMinute > previous.endMinute) {
      merged.push({ ...range });
    } else if (range.endMinute > previous.endMinute) {
      previous.endMinute = range.endMinute;
    }
  }
  return merged;
}

function parseRange(value: string): ScheduleRange[] {
  const match = value.match(/\b(\d{1,2}):(\d{2})\s*(?:-|a)\s*(\d{1,2}):(\d{2})\b/i);
  if (!match) return [];
  const startMinute = timeMinute(match[1], match[2]);
  let endMinute = timeMinute(match[3], match[4]);
  if (startMinute === null || endMinute === null) return [];
  if (endMinute <= startMinute) endMinute += 24 * 60;
  return [{ startMinute, endMinute }];
}

function timeMinute(hourValue: string | undefined, minuteValue: string | undefined): number | null {
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function localMinuteOfDay(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return part('hour') * 60 + part('minute');
}
