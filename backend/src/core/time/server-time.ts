import { env } from '../config/env.js';

export const SERVER_TIME_ZONE = env.APP_TIME_ZONE;

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

export function serverNow(): Date {
  return new Date();
}

export function serverLocalDateString(value: Date = serverNow()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SERVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  return `${getPart(parts, 'year')}-${getPart(parts, 'month')}-${getPart(parts, 'day')}`;
}

export function serverLocalHourMinute(value: Date = serverNow()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SERVER_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);

  return `${getPart(parts, 'hour')}:${getPart(parts, 'minute')}`;
}

export function attendanceDateFromServerNow(value: Date = serverNow()): Date {
  return new Date(`${serverLocalDateString(value)}T00:00:00.000Z`);
}
