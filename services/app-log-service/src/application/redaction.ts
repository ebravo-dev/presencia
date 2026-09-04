const sensitiveKey = /pass(word)?|secret|token|authorization|cookie|credential|session.?id|private.?key/i;

export function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/((?:password|secret|token|authorization|cookie|credential|session.?id)["']?\s*[:=]\s*)[^,}\s]+/gi, '$1[REDACTED]');
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED_DEPTH]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
      key,
      sensitiveKey.test(key) ? '[REDACTED]' : redactValue(item, depth + 1),
    ]));
  }
  return value;
}
