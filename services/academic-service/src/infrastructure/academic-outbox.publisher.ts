import { once } from 'node:events';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { Prisma, type AcademicOutboxEvent, type PrismaClient } from '../generated/prisma/index.js';

const DOMAIN_EXCHANGE = 'presencia.domain.v1';

export interface OutboxLogger {
  info(bindings: object, message: string): void;
  warn(bindings: object, message: string): void;
  error(bindings: object, message: string): void;
}

export interface AcademicEventEnvelope {
  eventId: string;
  eventType: string;
  occurredAt: string;
  correlationId: string;
  causationId: string;
  producer: 'academic-service';
  aggregateId: string;
  schemaVersion: 1;
  payload: unknown;
}

export function toAcademicEventEnvelope(event: AcademicOutboxEvent): AcademicEventEnvelope {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt.toISOString(),
    correlationId: event.correlationId,
    causationId: event.causationId,
    producer: 'academic-service',
    aggregateId: event.aggregateId,
    schemaVersion: 1,
    payload: event.payload,
  };
}

export class AcademicOutboxPublisher {
  private connection: ChannelModel | undefined;
  private channel: ConfirmChannel | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private dispatching = false;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly rabbitmqUrl: string,
    private readonly pollIntervalMs: number,
    private readonly logger: OutboxLogger,
  ) {}

  async start(): Promise<void> {
    if (this.pollTimer) return;
    this.stopping = false;
    this.pollTimer = setInterval(() => void this.dispatch(), this.pollIntervalMs);
    this.pollTimer.unref();
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = undefined;
    this.connection = undefined;
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
      await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
      this.connection = connection;
      this.channel = channel;
      connection.on('error', (error) => this.logger.error({ err: error }, 'Error en RabbitMQ académico.'));
      connection.on('close', () => {
        this.channel = undefined;
        this.connection = undefined;
        if (!this.stopping) this.scheduleReconnect();
      });
      await this.dispatch();
      this.logger.info({ exchange: DOMAIN_EXCHANGE }, 'Outbox académico conectado.');
    } catch (error) {
      this.logger.warn({ err: error }, 'RabbitMQ no está disponible; el outbox académico conserva los eventos.');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopping) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, 5_000);
    this.reconnectTimer.unref();
  }

  private async dispatch(): Promise<void> {
    if (this.dispatching || !this.channel || this.stopping) return;
    this.dispatching = true;
    try {
      const events = await this.claimEvents();
      for (const event of events) await this.publish(event);
    } catch (error) {
      this.logger.error({ err: error }, 'Falló el despacho del outbox académico.');
    } finally {
      this.dispatching = false;
    }
  }

  private claimEvents(): Promise<AcademicOutboxEvent[]> {
    return this.prisma.$transaction(async (transaction) => {
      const events = await transaction.$queryRaw<AcademicOutboxEvent[]>(Prisma.sql`
        SELECT
          event_id AS "eventId", event_type AS "eventType", aggregate_id AS "aggregateId",
          correlation_id AS "correlationId", causation_id AS "causationId", payload,
          occurred_at AS "occurredAt", published_at AS "publishedAt", attempts,
          next_attempt_at AS "nextAttemptAt", locked_at AS "lockedAt",
          last_error AS "lastError", created_at AS "createdAt"
        FROM academic_outbox_events
        WHERE published_at IS NULL
          AND next_attempt_at <= NOW()
          AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
        ORDER BY created_at
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      `);
      if (events.length > 0) {
        await transaction.academicOutboxEvent.updateMany({
          where: { eventId: { in: events.map(({ eventId }) => eventId) } },
          data: { lockedAt: new Date() },
        });
      }
      return events;
    });
  }

  private async publish(event: AcademicOutboxEvent): Promise<void> {
    const channel = this.channel;
    if (!channel) return;
    try {
      const accepted = channel.publish(
        DOMAIN_EXCHANGE,
        event.eventType,
        Buffer.from(JSON.stringify(toAcademicEventEnvelope(event))),
        {
          persistent: true,
          contentType: 'application/json',
          contentEncoding: 'utf-8',
          messageId: event.eventId,
          correlationId: event.correlationId,
          timestamp: event.occurredAt.getTime(),
        },
      );
      if (!accepted) await once(channel, 'drain');
      await channel.waitForConfirms();
      await this.prisma.academicOutboxEvent.update({
        where: { eventId: event.eventId },
        data: { publishedAt: new Date(), lockedAt: null, lastError: null },
      });
    } catch (error) {
      const attempts = event.attempts + 1;
      await this.prisma.academicOutboxEvent.update({
        where: { eventId: event.eventId },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + calculateBackoff(attempts)),
          lockedAt: null,
          lastError: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown RabbitMQ error',
        },
      });
      this.logger.warn({ err: error, eventId: event.eventId, attempts }, 'Evento académico conservado para reintento.');
    }
  }
}

function calculateBackoff(attempt: number): number {
  return Math.min(300_000, 1_000 * 2 ** Math.min(attempt, 8));
}
