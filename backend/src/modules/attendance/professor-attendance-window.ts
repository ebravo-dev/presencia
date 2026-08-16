export type ProfessorArrivalStatus = 'ON_TIME' | 'LATE' | 'OUTSIDE_WINDOW' | 'UNKNOWN_SCHEDULE';

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
    const ranges = scheduleRanges(input.schedule, day);
    if (ranges.length === 0) return 'UNKNOWN_SCHEDULE';

    const arrivalMinute = minuteOfDay(input.observedAt, input.timeZone);
    const tolerance = Math.max(0, Math.min(120, Math.round(input.toleranceMinutes)));
    for (const range of ranges) {
        if (arrivalMinute < range.start - tolerance || arrivalMinute > range.end + tolerance) continue;
        return arrivalMinute <= range.start + tolerance ? 'ON_TIME' : 'LATE';
    }
    return 'OUTSIDE_WINDOW';
}

function scheduleRanges(schedule: unknown, day: string): Array<{ start: number; end: number }> {
    if (!schedule || typeof schedule !== 'object') return [];
    const source = schedule as Record<string, unknown>;
    const value = (DAY_ALIASES[day] ?? [day]).map((key) => source[key]).find((item) => item !== undefined);
    const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;\n·]+/) : [];
    const parsed = items.flatMap((item) => {
        if (typeof item === 'string') return parseRange(item);
        if (!item || typeof item !== 'object') return [];
        const slot = item as Record<string, unknown>;
        const raw = typeof slot.raw === 'string'
            ? slot.raw
            : typeof slot.startTime === 'string' && typeof slot.endTime === 'string'
                ? `${slot.startTime}-${slot.endTime}`
                : '';
        return parseRange(raw);
    }).sort((left, right) => left.start - right.start);

    const merged: Array<{ start: number; end: number }> = [];
    for (const range of parsed) {
        const previous = merged.at(-1);
        if (!previous || range.start > previous.end) merged.push({ ...range });
        else if (range.end > previous.end) previous.end = range.end;
    }
    return merged;
}

function parseRange(value: string): Array<{ start: number; end: number }> {
    const match = value.match(/\b(\d{1,2}):(\d{2})\s*(?:-|a)\s*(\d{1,2}):(\d{2})\b/i);
    if (!match) return [];
    const start = parseTime(match[1], match[2]);
    let end = parseTime(match[3], match[4]);
    if (start === null || end === null) return [];
    if (end <= start) end += 24 * 60;
    return [{ start, end }];
}

function parseTime(hourValue: string | undefined, minuteValue: string | undefined): number | null {
    const hour = Number(hourValue);
    const minute = Number(minuteValue);
    return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
        ? hour * 60 + minute
        : null;
}

function minuteOfDay(value: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    return part('hour') * 60 + part('minute');
}
