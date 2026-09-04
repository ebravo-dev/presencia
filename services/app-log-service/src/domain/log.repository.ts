import type { AppLogEventInput, LogBatchInput, LogQuery } from './log-event.js';

export interface StoredLogEvent extends AppLogEventInput {
  readonly receivedAt: string;
  readonly sourceIp?: string;
}

export interface LogPage {
  readonly data: StoredLogEvent[];
  readonly meta: { nextCursor: string | null; total: number; generatedAt: string };
}

export interface LogSummary {
  readonly total: number;
  readonly last24Hours: number;
  readonly errorsLast24Hours: number;
  readonly fatalLast24Hours: number;
  readonly activeInstallationsLast24Hours: number;
  readonly byApplication: Array<{ application: 'STUDENT' | 'PROFESSOR'; count: number }>;
  readonly byLevel: Array<{ level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'; count: number }>;
  readonly topErrors: Array<{ eventName: string; count: number }>;
  readonly generatedAt: string;
}

export interface LogRepository {
  append(batch: LogBatchInput, sourceIp?: string): Promise<{ acceptedEventIds: string[]; inserted: number; duplicates: number }>;
  search(query: LogQuery): Promise<LogPage>;
  summary(): Promise<LogSummary>;
}
