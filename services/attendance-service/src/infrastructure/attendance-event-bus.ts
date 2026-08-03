import { once } from 'node:events';
import { connect, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { z } from 'zod';
import { Prisma, type AttendanceOutboxEvent, type PrismaClient } from '../generated/prisma/index.js';
import type { AttendanceRepository } from '../domain/attendance.repository.js';

const DOMAIN_EXCHANGE = 'presencia.domain.v1';
const RETRY_EXCHANGE = 'presencia.domain.retry.v1';
const DEAD_LETTER_EXCHANGE = 'presencia.domain.dlx.v1';
const ROSTER_QUEUE = 'presencia.attendance.academic-roster.v1';
const DEAD_LETTER_QUEUE = 'presencia.attendance.dead.v1';
const CONSUMER = 'attendance-service.academic-roster.v1';
const CONSUMED_EVENTS = [
  'academic.roster_updated.v1',
  'academic.group_deactivated.v1',
  'uat.attendance_uploaded.v1',
  'uat.attendance_upload_failed.v1',
] as const;
const RETRY_DELAYS = [5_000, 30_000, 300_000] as const;

export interface AttendanceEventLogger {
  info(bindings: object, message: string): void;
  warn(bindings: object, message: string): void;
  error(bindings: object, message: string): void;
}

export interface AttendanceEventEnvelope {
  eventId: string;
  eventType: string;
  occurredAt: string;
  correlationId: string;
  causationId: string;
  producer: 'attendance-service';
  aggregateId: string;
  schemaVersion: 1;
  payload: unknown;
}

const envelopeSchema = z.object({
  eventId: z.uuid(), eventType: z.string(), occurredAt: z.iso.datetime(), correlationId: z.string().min(1),
  causationId: z.string().min(1), producer: z.string(), aggregateId: z.string().min(1), schemaVersion: z.literal(1),
  payload: z.record(z.string(), z.unknown()),
});
const rosterPayloadSchema = z.object({
  externalGroupId: z.string().min(1), professorExternalId: z.string().min(1), groupName: z.string().min(1),
  groupLetter: z.string().default(''), schedule: z.record(z.string(), z.unknown()), rosterVersion: z.string().min(1),
  rosterAuthoritative: z.boolean(),
  teacher: z.object({ name: z.string().min(1), email: z.string().trim().min(1).max(320).nullable().optional() }).optional(),
  group: z.object({ classroom: z.string().nullable().optional(), period: z.string().nullable().optional() }).passthrough().optional(),
  students: z.array(z.object({
    matricula: z.string().min(1), name: z.string().min(1),
    uatStudentId: z.number().int().positive().nullable().optional(), listNumber: z.number().int().nonnegative().nullable().optional(),
  })).nullable(),
});
const uploadResultPayloadSchema = z.object({
  attendanceSessionId: z.string().min(1), version: z.number().int().positive(),
  clientRecordId: z.string().min(1), batchId: z.string().min(1), jobId: z.string().min(1),
  error: z.string().nullable(),
});

export function toAttendanceEventEnvelope(event: AttendanceOutboxEvent): AttendanceEventEnvelope {
  return {
    eventId: event.eventId, eventType: event.eventType, occurredAt: event.occurredAt.toISOString(),
    correlationId: event.correlationId, causationId: event.causationId, producer: 'attendance-service',
    aggregateId: event.aggregateId, schemaVersion: 1, payload: event.payload,
  };
}

export class AttendanceEventBus {
  private connection: ChannelModel | undefined;
  private channel: ConfirmChannel | undefined;
  private consumerTag: string | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private dispatching = false;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: AttendanceRepository,
    private readonly rabbitmqUrl: string,
    private readonly pollIntervalMs: number,
    private readonly logger: AttendanceEventLogger,
  ) {}

  async start(): Promise<void> {
    if (this.pollTimer) return;
    this.stopping = false;
    this.pollTimer = setInterval(() => void this.dispatchOutbox(), this.pollIntervalMs);
    this.pollTimer.unref();
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.channel && this.consumerTag) await this.channel.cancel(this.consumerTag).catch(() => undefined);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.connection = undefined;
    this.channel = undefined;
    this.consumerTag = undefined;
    this.pollTimer = undefined;
    this.reconnectTimer = undefined;
  }

  isReady(): boolean {
    return this.channel !== undefined;
  }

  private async connect(): Promise<void> {
    if (this.channel || this.stopping) return;
    try {
      const connection = await connect(this.rabbitmqUrl);
      const channel = await connection.createConfirmChannel();
      await this.configure(channel);
      const consumer = await channel.consume(ROSTER_QUEUE, (message) => {
        if (message) void this.consume(message);
      }, { noAck: false });
      this.connection = connection;
      this.channel = channel;
      this.consumerTag = consumer.consumerTag;
      connection.on('error', (error) => this.logger.error({ err: error }, 'Error en RabbitMQ de Attendance.'));
      connection.on('close', () => {
        this.connection = undefined;
        this.channel = undefined;
        this.consumerTag = undefined;
        if (!this.stopping) this.scheduleReconnect();
      });
      await this.dispatchOutbox();
      this.logger.info({ queue: ROSTER_QUEUE }, 'Bus de eventos de Attendance conectado.');
    } catch (error) {
      this.logger.warn({ err: error }, 'RabbitMQ no está disponible; Attendance conserva el outbox.');
      this.scheduleReconnect();
    }
  }

  private async configure(channel: ConfirmChannel): Promise<void> {
    await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, '#');
    await channel.assertQueue(ROSTER_QUEUE, { durable: true, arguments: { 'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE } });
    for (const eventType of CONSUMED_EVENTS) {
      await channel.bindQueue(ROSTER_QUEUE, DOMAIN_EXCHANGE, eventType);
      for (const [index, delay] of RETRY_DELAYS.entries()) {
        const routingKey = `${eventType}.retry.${index + 1}`;
        const queue = `${ROSTER_QUEUE}.${routingKey}`;
        await channel.assertQueue(queue, {
          durable: true,
          arguments: {
            'x-message-ttl': delay,
            'x-dead-letter-exchange': DOMAIN_EXCHANGE,
            'x-dead-letter-routing-key': eventType,
          },
        });
        await channel.bindQueue(queue, RETRY_EXCHANGE, routingKey);
      }
    }
    await channel.prefetch(8);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopping) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, 5_000);
    this.reconnectTimer.unref();
  }

  private async consume(message: ConsumeMessage): Promise<void> {
    const channel = this.channel;
    if (!channel) return;
    const eventId = message.properties.messageId;
    if (!eventId) return channel.nack(message, false, false);
    try {
      const processed = await this.prisma.processedAttendanceEvent.findUnique({
        where: { eventId_consumer: { eventId, consumer: CONSUMER } },
      });
      if (processed) return channel.ack(message);
      const envelope = envelopeSchema.parse(JSON.parse(message.content.toString('utf8')));
      if (envelope.eventType === 'academic.roster_updated.v1') {
        const payload = rosterPayloadSchema.parse(envelope.payload);
        await this.repository.applyRoster({
          externalGroupId: payload.externalGroupId,
          uatGroupId: positiveInteger(payload.externalGroupId),
          name: payload.groupName,
          groupLetter: payload.groupLetter,
          professorExternalId: payload.professorExternalId,
          professorName: payload.teacher?.name,
          professorEmail: payload.teacher?.email,
          classroom: payload.group?.classroom ?? null,
          period: payload.group?.period ?? null,
          schedule: payload.schedule,
          rosterVersion: payload.rosterVersion,
          rosterObservedAt: new Date(envelope.occurredAt),
          rosterAuthoritative: payload.rosterAuthoritative,
          students: payload.students ?? [],
        });
      } else if (envelope.eventType === 'academic.group_deactivated.v1') {
        const payload = z.object({ externalGroupId: z.string().min(1) }).parse(envelope.payload);
        await this.repository.deactivateRoster(payload.externalGroupId, new Date(envelope.occurredAt));
      } else if (envelope.eventType === 'uat.attendance_uploaded.v1' || envelope.eventType === 'uat.attendance_upload_failed.v1') {
        const payload = uploadResultPayloadSchema.parse(envelope.payload);
        await this.repository.markUploadResult({
          attendanceSessionId: payload.attendanceSessionId,
          version: payload.version,
          status: envelope.eventType === 'uat.attendance_uploaded.v1' ? 'COMPLETED' : 'FAILED',
          error: payload.error,
        });
      } else {
        throw new Error(`Unsupported Attendance dependency event: ${envelope.eventType}`);
      }
      await this.prisma.processedAttendanceEvent.create({ data: { eventId, consumer: CONSUMER } });
      channel.ack(message);
    } catch (error) {
      await this.retryOrDeadLetter(message, error);
    }
  }

  private async retryOrDeadLetter(message: ConsumeMessage, error: unknown): Promise<void> {
    const channel = this.channel;
    if (!channel) return;
    const retryCount = Number(message.properties.headers?.['x-retry-count'] ?? 0);
    const eventType = message.fields.routingKey;
    const nextAttempt = retryCount + 1;
    const exhausted = nextAttempt > RETRY_DELAYS.length;
    const exchange = exhausted ? DEAD_LETTER_EXCHANGE : RETRY_EXCHANGE;
    const routingKey = exhausted ? eventType : `${eventType}.retry.${nextAttempt}`;
    channel.publish(exchange, routingKey, message.content, {
      ...message.properties,
      persistent: true,
      headers: { ...message.properties.headers, 'x-retry-count': nextAttempt, 'x-last-error': errorMessage(error) },
    });
    await channel.waitForConfirms();
    channel.ack(message);
    this.logger.warn({ eventId: message.properties.messageId, nextAttempt, exhausted, err: error }, 'Evento académico reprogramado.');
  }

  private async dispatchOutbox(): Promise<void> {
    if (this.dispatching || !this.channel || this.stopping) return;
    this.dispatching = true;
    try {
      const events = await this.claimOutbox();
      for (const event of events) await this.publish(event);
    } catch (error) {
      this.logger.error({ err: error }, 'Falló el despacho del outbox de Attendance.');
    } finally {
      this.dispatching = false;
    }
  }

  private claimOutbox(): Promise<AttendanceOutboxEvent[]> {
    return this.prisma.$transaction(async (transaction) => {
      const events = await transaction.$queryRaw<AttendanceOutboxEvent[]>(Prisma.sql`
        SELECT event_id AS "eventId", event_type AS "eventType", aggregate_id AS "aggregateId",
          correlation_id AS "correlationId", causation_id AS "causationId", payload,
          occurred_at AS "occurredAt", published_at AS "publishedAt", attempts,
          next_attempt_at AS "nextAttemptAt", locked_at AS "lockedAt", last_error AS "lastError", created_at AS "createdAt"
        FROM attendance_outbox_events
        WHERE published_at IS NULL AND next_attempt_at <= NOW()
          AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
        ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED
      `);
      if (events.length > 0) await transaction.attendanceOutboxEvent.updateMany({
        where: { eventId: { in: events.map(({ eventId }) => eventId) } }, data: { lockedAt: new Date() },
      });
      return events;
    });
  }

  private async publish(event: AttendanceOutboxEvent): Promise<void> {
    const channel = this.channel;
    if (!channel) return;
    try {
      const accepted = channel.publish(
        DOMAIN_EXCHANGE, event.eventType, Buffer.from(JSON.stringify(toAttendanceEventEnvelope(event))),
        {
          persistent: true, contentType: 'application/json', contentEncoding: 'utf-8',
          messageId: event.eventId, correlationId: event.correlationId, timestamp: event.occurredAt.getTime(),
        },
      );
      if (!accepted) await once(channel, 'drain');
      await channel.waitForConfirms();
      await this.prisma.attendanceOutboxEvent.update({
        where: { eventId: event.eventId }, data: { publishedAt: new Date(), lockedAt: null, lastError: null },
      });
    } catch (error) {
      const attempts = event.attempts + 1;
      await this.prisma.attendanceOutboxEvent.update({
        where: { eventId: event.eventId },
        data: {
          attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8))),
          lockedAt: null, lastError: errorMessage(error),
        },
      });
    }
  }
}

function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : 'Unknown event error').slice(0, 2_000);
}
