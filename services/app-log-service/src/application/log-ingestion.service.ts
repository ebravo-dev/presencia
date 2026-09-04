import type { LogBatchInput } from '../domain/log-event.js';
import type { LogRepository } from '../domain/log.repository.js';
import { redactText, redactValue } from './redaction.js';

export class LogIngestionService {
  constructor(private readonly repository: LogRepository) {}

  append(batch: LogBatchInput, sourceIp?: string) {
    return this.repository.append({
      ...batch,
      events: batch.events.map((event) => ({
        ...event,
        message: redactText(event.message),
        ...(event.errorMessage ? { errorMessage: redactText(event.errorMessage) } : {}),
        ...(event.stackTrace ? { stackTrace: redactText(event.stackTrace) } : {}),
        ...(event.context ? { context: redactValue(event.context) as Record<string, unknown> } : {}),
      })),
    }, sourceIp);
  }
}
