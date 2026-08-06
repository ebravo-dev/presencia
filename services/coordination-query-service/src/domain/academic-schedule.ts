export const ACADEMIC_SCHEDULE_DAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;

export type AcademicScheduleDay = typeof ACADEMIC_SCHEDULE_DAYS[number];

export interface AcademicScheduleSlot {
  raw: string;
  startTime: string | null;
  endTime: string | null;
}

const DAY_ALIASES: Record<AcademicScheduleDay, readonly string[]> = {
  monday: ['monday', 'lunes'],
  tuesday: ['tuesday', 'martes'],
  wednesday: ['wednesday', 'miercoles', 'miércoles'],
  thursday: ['thursday', 'jueves'],
  friday: ['friday', 'viernes'],
  saturday: ['saturday', 'sabado', 'sábado'],
  sunday: ['sunday', 'domingo'],
};

export function normalizeAcademicSchedule(value: unknown): Record<AcademicScheduleDay, AcademicScheduleSlot[]> {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(ACADEMIC_SCHEDULE_DAYS.map((day) => {
    const rawSlots = DAY_ALIASES[day]
      .map((key) => source[key])
      .find((item) => item !== undefined);
    return [day, normalizeSlots(rawSlots)];
  })) as Record<AcademicScheduleDay, AcademicScheduleSlot[]>;
}

function normalizeSlots(value: unknown): AcademicScheduleSlot[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;\n]+/) : [];
  return values.flatMap((item) => {
    if (typeof item === 'string') return slotFromText(item);
    if (!item || typeof item !== 'object') return [];
    const source = item as Record<string, unknown>;
    const startTime = readTime(source.startTime);
    const endTime = readTime(source.endTime);
    const raw = typeof source.raw === 'string' && source.raw.trim()
      ? source.raw.trim()
      : startTime && endTime ? `${startTime}-${endTime}` : '';
    return isScheduleValue(raw) ? [{ raw, startTime, endTime }] : [];
  });
}

function slotFromText(value: string): AcademicScheduleSlot[] {
  const raw = value.trim();
  if (!isScheduleValue(raw)) return [];
  const match = raw.match(/\b(\d{1,2}:\d{2})\s*(?:-|a)\s*(\d{1,2}:\d{2})\b/i);
  return [{ raw, startTime: readTime(match?.[1]), endTime: readTime(match?.[2]) }];
}

function readTime(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value.trim())) return null;
  const [hours, minutes] = value.trim().split(':');
  return `${hours?.padStart(2, '0')}:${minutes}`;
}

function isScheduleValue(value: string): boolean {
  return Boolean(value) && !/^(?:-+|—|n\/?[ad]|no aplica|sin horario)$/i.test(value);
}
