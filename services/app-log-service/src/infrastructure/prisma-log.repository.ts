import type { Prisma, PrismaClient } from '../generated/prisma/index.js';
import type { LogBatchInput, LogQuery } from '../domain/log-event.js';
import type { LogPage, LogRepository, LogSummary, StoredLogEvent } from '../domain/log.repository.js';

export class PrismaLogRepository implements LogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(batch: LogBatchInput, sourceIp?: string) {
    const result = await this.prisma.appLogEvent.createMany({
      data: batch.events.map((event) => ({
        id: event.eventId,
        schemaVersion: batch.schemaVersion,
        batchId: batch.batchId,
        sequence: BigInt(event.sequence),
        level: event.level,
        application: event.application,
        eventName: event.eventName,
        message: event.message,
        occurredAt: new Date(event.occurredAt),
        installationId: event.installationId,
        appSessionId: event.appSessionId,
        appVersion: event.appVersion,
        buildNumber: event.buildNumber,
        platform: event.platform,
        osVersion: event.osVersion,
        ...(event.userIdentifier ? { userIdentifier: event.userIdentifier } : {}),
        ...(event.deviceModel ? { deviceModel: event.deviceModel } : {}),
        ...(event.deviceManufacturer ? { deviceManufacturer: event.deviceManufacturer } : {}),
        ...(event.locale ? { locale: event.locale } : {}),
        ...(event.timezoneOffset ? { timezoneOffset: event.timezoneOffset } : {}),
        ...(event.networkType ? { networkType: event.networkType } : {}),
        ...(event.errorType ? { errorType: event.errorType } : {}),
        ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
        ...(event.stackTrace ? { stackTrace: event.stackTrace } : {}),
        ...(event.correlationId ? { correlationId: event.correlationId } : {}),
        ...(event.context ? { context: event.context as Prisma.InputJsonValue } : {}),
        ...(sourceIp ? { sourceIp } : {}),
      })),
      skipDuplicates: true,
    });
    const requestedIds = batch.events.map(({ eventId }) => eventId);
    const accepted = await this.prisma.appLogEvent.findMany({
      where: { id: { in: requestedIds } }, select: { id: true },
    });
    const acceptedEventIds = accepted.map(({ id }) => id);
    return { acceptedEventIds, inserted: result.count, duplicates: acceptedEventIds.length - result.count };
  }

  async search(query: LogQuery): Promise<LogPage> {
    const cursor = decodeCursor(query.cursor);
    const baseWhere: Prisma.AppLogEventWhereInput = {
      ...(query.application ? { application: query.application } : {}),
      ...(query.level ? { level: query.level } : {}),
      ...(query.installationId ? { installationId: query.installationId } : {}),
      ...(query.userIdentifier ? { userIdentifier: { contains: query.userIdentifier, mode: 'insensitive' } } : {}),
      ...((query.from || query.to) ? { occurredAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      } } : {}),
      ...(query.q ? { OR: [
        { message: { contains: query.q, mode: 'insensitive' } },
        { eventName: { contains: query.q, mode: 'insensitive' } },
        { errorMessage: { contains: query.q, mode: 'insensitive' } },
        { userIdentifier: { contains: query.q, mode: 'insensitive' } },
        { correlationId: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
    };
    const where: Prisma.AppLogEventWhereInput = cursor ? {
      AND: [baseWhere, { OR: [
        { receivedAt: { lt: cursor.receivedAt } },
        { receivedAt: cursor.receivedAt, id: { lt: cursor.id } },
      ] }],
    } : baseWhere;
    const [rows, total] = await Promise.all([
      this.prisma.appLogEvent.findMany({
        where, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
      }),
      this.prisma.appLogEvent.count({ where: baseWhere }),
    ]);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map(toStoredEvent),
      meta: {
        nextCursor: hasMore && last ? encodeCursor(last.receivedAt, last.id) : null,
        total,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async summary(): Promise<LogSummary> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const [total, last24Hours, errorsLast24Hours, fatalLast24Hours, installations, byApplication, byLevel, topErrors] = await Promise.all([
      this.prisma.appLogEvent.count(),
      this.prisma.appLogEvent.count({ where: { receivedAt: { gte: since } } }),
      this.prisma.appLogEvent.count({ where: { receivedAt: { gte: since }, level: { in: ['ERROR', 'FATAL'] } } }),
      this.prisma.appLogEvent.count({ where: { receivedAt: { gte: since }, level: 'FATAL' } }),
      this.prisma.appLogEvent.groupBy({ by: ['installationId'], where: { receivedAt: { gte: since } } }),
      this.prisma.appLogEvent.groupBy({ by: ['application'], where: { receivedAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.appLogEvent.groupBy({ by: ['level'], where: { receivedAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.appLogEvent.groupBy({
        by: ['eventName'],
        where: { receivedAt: { gte: since }, level: { in: ['ERROR', 'FATAL'] } },
        _count: { eventName: true },
        orderBy: { _count: { eventName: 'desc' } },
        take: 5,
      }),
    ]);
    return {
      total, last24Hours, errorsLast24Hours, fatalLast24Hours,
      activeInstallationsLast24Hours: installations.length,
      byApplication: byApplication.map((item) => ({ application: item.application, count: item._count._all })),
      byLevel: byLevel.map((item) => ({ level: item.level, count: item._count._all })),
      topErrors: topErrors.map((item) => ({ eventName: item.eventName, count: item._count.eventName })),
      generatedAt: new Date().toISOString(),
    };
  }
}

function toStoredEvent(row: Awaited<ReturnType<PrismaClient['appLogEvent']['findFirstOrThrow']>>): StoredLogEvent {
  return {
    eventId: row.id,
    sequence: Number(row.sequence),
    level: row.level,
    application: row.application,
    eventName: row.eventName,
    message: row.message,
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    installationId: row.installationId,
    appSessionId: row.appSessionId,
    appVersion: row.appVersion,
    buildNumber: row.buildNumber,
    platform: row.platform,
    osVersion: row.osVersion,
    ...(row.userIdentifier ? { userIdentifier: row.userIdentifier } : {}),
    ...(row.deviceModel ? { deviceModel: row.deviceModel } : {}),
    ...(row.deviceManufacturer ? { deviceManufacturer: row.deviceManufacturer } : {}),
    ...(row.locale ? { locale: row.locale } : {}),
    ...(row.timezoneOffset ? { timezoneOffset: row.timezoneOffset } : {}),
    ...(row.networkType ? { networkType: row.networkType } : {}),
    ...(row.errorType ? { errorType: row.errorType } : {}),
    ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
    ...(row.stackTrace ? { stackTrace: row.stackTrace } : {}),
    ...(row.correlationId ? { correlationId: row.correlationId } : {}),
    ...(row.context && typeof row.context === 'object' && !Array.isArray(row.context) ? { context: row.context as Record<string, unknown> } : {}),
    ...(row.sourceIp ? { sourceIp: row.sourceIp } : {}),
  };
}

function encodeCursor(receivedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ receivedAt: receivedAt.toISOString(), id })).toString('base64url');
}

function decodeCursor(value?: string): { receivedAt: Date; id: string } | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof parsed.receivedAt !== 'string' || typeof parsed.id !== 'string') return undefined;
    const receivedAt = new Date(parsed.receivedAt);
    if (!Number.isFinite(receivedAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(parsed.id)) return undefined;
    return { receivedAt, id: parsed.id };
  } catch {
    return undefined;
  }
}
