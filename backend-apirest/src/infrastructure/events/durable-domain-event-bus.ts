import { once } from 'node:events';
import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
} from 'amqplib';
import { Prisma, type DomainOutboxEvent, type PrismaClient } from '@prisma/client';
import type { DomainEventMap, IDomainEventBus } from '../../domain/events/domain-event-bus.js';
import {
  TEACHER_AUTHENTICATED_EVENT,
  type TeacherAuthenticatedEvent,
} from '../../domain/events/teacher-authenticated.event.js';

const DOMAIN_EXCHANGE = 'presencia.domain.v1';
const RETRY_EXCHANGE = 'presencia.domain.retry.v1';
const DEAD_LETTER_EXCHANGE = 'presencia.domain.dlx.v1';
const TEACHER_QUEUE = 'presencia.uat-integration.teacher-authenticated.v1';
const DEAD_LETTER_QUEUE = 'presencia.uat-integration.dead.v1';
const CONSUMER_NAME = 'uat-integration.sync-teacher-data.v1';
const RETRY_DELAYS_MS = [5_000, 30_000, 300_000] as const;

export interface DurableEventBusLogger {
  info(bindings: object, message: string): void;
  warn(bindings: object, message: string): void;
  error(bindings: object, message: string): void;
}

export interface DurableDomainEventBusOptions {
  readonly rabbitmqUrl: string;
  readonly pollIntervalMs?: number;
  readonly batchSize?: number;
}

type EventListener<TName extends keyof DomainEventMap> = (
  event: DomainEventMap[TName],
) => Promise<void>;

export class DurableDomainEventBus implements IDomainEventBus {
  private readonly listeners = new Map<keyof DomainEventMap, Set<EventListener<keyof DomainEventMap>>>();
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private consumerTag?: string;
  private dispatchTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private dispatching = false;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: DurableDomainEventBusOptions,
    private readonly logger: DurableEventBusLogger,
  ) {}

  async start(): Promise<void> {
    if (this.dispatchTimer) return;
    this.stopping = false;
    this.dispatchTimer = setInterval(
      () => void this.dispatchOutbox(),
      this.options.pollIntervalMs ?? 1_000,
    );
    this.dispatchTimer.unref();
    await this.connectBroker();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.channel && this.consumerTag) {
      await this.channel.cancel(this.consumerTag).catch(() => undefined);
    }
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = undefined;
    this.connection = undefined;
    this.dispatchTimer = undefined;
    this.reconnectTimer = undefined;
  }

  isReady(): boolean {
    return this.channel !== undefined;
  }

  async publish<TName extends keyof DomainEventMap>(event: DomainEventMap[TName]): Promise<void> {
    const serialized = JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;
    await this.prisma.domainOutboxEvent.upsert({
      where: { id: event.eventId },
      create: {
        id: event.eventId,
        eventName: event.eventName,
        aggregateId: event.teacher.externalId,
        payload: serialized,
        occurredAt: event.occurredAt,
      },
      update: {},
    });
    void this.dispatchOutbox();
  }

  subscribe<TName extends keyof DomainEventMap>(
    eventName: TName,
    listener: EventListener<TName>,
  ): () => void {
    const listeners = this.listeners.get(eventName) ?? new Set<EventListener<keyof DomainEventMap>>();
    listeners.add(listener as EventListener<keyof DomainEventMap>);
    this.listeners.set(eventName, listeners);
    return () => listeners.delete(listener as EventListener<keyof DomainEventMap>);
  }

  private async configureTopology(channel: ConfirmChannel): Promise<void> {
    await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, '#');
    await channel.assertQueue(TEACHER_QUEUE, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE },
    });
    await channel.bindQueue(TEACHER_QUEUE, DOMAIN_EXCHANGE, TEACHER_AUTHENTICATED_EVENT);
    await channel.prefetch(8);

    for (const [index, delay] of RETRY_DELAYS_MS.entries()) {
      const attempt = index + 1;
      const queue = `${TEACHER_QUEUE}.retry.${attempt}`;
      const routingKey = `${TEACHER_AUTHENTICATED_EVENT}.retry.${attempt}`;
      await channel.assertQueue(queue, {
        durable: true,
        arguments: {
          'x-message-ttl': delay,
          'x-dead-letter-exchange': DOMAIN_EXCHANGE,
          'x-dead-letter-routing-key': TEACHER_AUTHENTICATED_EVENT,
        },
      });
      await channel.bindQueue(queue, RETRY_EXCHANGE, routingKey);
    }
  }

  private async connectBroker(): Promise<void> {
    if (this.channel || this.stopping) return;
    try {
      const connection = await connect(this.options.rabbitmqUrl);
      const channel = await connection.createConfirmChannel();
      await this.configureTopology(channel);
      const consumer = await channel.consume(
        TEACHER_QUEUE,
        (message) => {
          if (message) void this.consume(message);
        },
        { noAck: false },
      );
      this.connection = connection;
      this.channel = channel;
      this.consumerTag = consumer.consumerTag;
      connection.on('error', (error) => {
        this.logger.error({ err: error }, 'Error en la conexión RabbitMQ.');
      });
      connection.on('close', () => {
        this.channel = undefined;
        this.connection = undefined;
        this.consumerTag = undefined;
        if (!this.stopping) {
          this.logger.error({}, 'RabbitMQ cerró la conexión; se reintentará sin perder el outbox.');
          this.scheduleReconnect();
        }
      });
      await this.dispatchOutbox();
      this.logger.info({ queue: TEACHER_QUEUE }, 'Bus durable de eventos conectado.');
    } catch (error) {
      this.logger.warn({ err: error }, 'RabbitMQ no está disponible; los eventos permanecerán en el outbox.');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopping) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectBroker();
    }, 5_000);
    this.reconnectTimer.unref();
  }

  private async dispatchOutbox(): Promise<void> {
    if (this.dispatching || !this.channel || this.stopping) return;
    this.dispatching = true;
    try {
      const events = await this.claimOutboxEvents();
      for (const event of events) await this.dispatchEvent(event);
    } catch (error) {
      this.logger.error({ err: error }, 'Fallo el despacho del outbox de eventos.');
    } finally {
      this.dispatching = false;
    }
  }

  private async claimOutboxEvents(): Promise<DomainOutboxEvent[]> {
    const batchSize = this.options.batchSize ?? 50;
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<DomainOutboxEvent[]>(Prisma.sql`
        SELECT
          id,
          event_name AS "eventName",
          aggregate_id AS "aggregateId",
          payload,
          occurred_at AS "occurredAt",
          published_at AS "publishedAt",
          attempts,
          next_attempt_at AS "nextAttemptAt",
          locked_at AS "lockedAt",
          last_error AS "lastError",
          created_at AS "createdAt"
        FROM domain_outbox_events
        WHERE published_at IS NULL
          AND next_attempt_at <= NOW()
          AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
        ORDER BY created_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `);
      if (rows.length > 0) {
        await transaction.domainOutboxEvent.updateMany({
          where: { id: { in: rows.map(({ id }) => id) } },
          data: { lockedAt: new Date() },
        });
      }
      return rows;
    });
  }

  private async dispatchEvent(event: DomainOutboxEvent): Promise<void> {
    const channel = this.requireChannel();
    try {
      const accepted = channel.publish(
        DOMAIN_EXCHANGE,
        event.eventName,
        Buffer.from(JSON.stringify(event.payload)),
        {
          persistent: true,
          contentType: 'application/json',
          contentEncoding: 'utf-8',
          messageId: event.id,
          timestamp: event.occurredAt.getTime(),
          headers: { 'x-correlation-id': event.id },
        },
      );
      if (!accepted) await once(channel, 'drain');
      await channel.waitForConfirms();
      await this.prisma.domainOutboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date(), lockedAt: null, lastError: null },
      });
    } catch (error) {
      const attempts = event.attempts + 1;
      const backoffMs = calculateOutboxBackoffMs(attempts);
      await this.prisma.domainOutboxEvent.update({
        where: { id: event.id },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + backoffMs),
          lockedAt: null,
          lastError: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown RabbitMQ publish error',
        },
      });
      this.logger.warn({ err: error, eventId: event.id, attempts }, 'Evento conservado en outbox para reintento.');
    }
  }

  private async consume(message: ConsumeMessage): Promise<void> {
    const channel = this.requireChannel();
    const eventId = message.properties.messageId;
    if (!eventId) {
      channel.nack(message, false, false);
      return;
    }

    const processed = await this.prisma.processedDomainEvent.findUnique({
      where: { eventId_consumer: { eventId, consumer: CONSUMER_NAME } },
    });
    if (processed) {
      channel.ack(message);
      return;
    }

    try {
      const event = this.parseTeacherEvent(message.content);
      const listeners = this.listeners.get(event.eventName);
      if (!listeners || listeners.size === 0) throw new Error(`No subscriber for ${event.eventName}`);
      for (const listener of listeners) await listener(event);
      await this.prisma.processedDomainEvent.create({ data: { eventId, consumer: CONSUMER_NAME } });
      channel.ack(message);
    } catch (error) {
      await this.retryOrDeadLetter(message, error);
    }
  }

  private async retryOrDeadLetter(message: ConsumeMessage, error: unknown): Promise<void> {
    const channel = this.requireChannel();
    const retryCount = Number(message.properties.headers?.['x-retry-count'] ?? 0);
    const decision = consumerRetryDecision(retryCount);
    if (decision.action === 'dead-letter') {
      this.logger.error({ err: error, eventId: message.properties.messageId, retryCount }, 'Evento enviado a DLQ.');
      channel.nack(message, false, false);
      return;
    }

    const accepted = channel.publish(RETRY_EXCHANGE, decision.routingKey, message.content, {
      ...message.properties,
      persistent: true,
      headers: { ...message.properties.headers, 'x-retry-count': decision.retryCount },
    });
    if (!accepted) await once(channel, 'drain');
    await channel.waitForConfirms();
    channel.ack(message);
    this.logger.warn({
      err: error,
      eventId: message.properties.messageId,
      retryCount: decision.retryCount,
      delayMs: decision.delayMs,
    }, 'Evento programado para reintento.');
  }

  private parseTeacherEvent(content: Buffer): TeacherAuthenticatedEvent {
    return parseTeacherAuthenticatedEvent(content);
  }

  private requireChannel(): ConfirmChannel {
    if (!this.channel) throw new Error('RabbitMQ channel is not available.');
    return this.channel;
  }
}

export function calculateOutboxBackoffMs(attempts: number): number {
  return Math.min(300_000, 1_000 * (2 ** Math.min(Math.max(attempts, 1), 8)));
}

export type ConsumerRetryDecision =
  | { readonly action: 'retry'; readonly retryCount: number; readonly delayMs: number; readonly routingKey: string }
  | { readonly action: 'dead-letter' };

export function consumerRetryDecision(retryCount: number): ConsumerRetryDecision {
  if (!Number.isInteger(retryCount) || retryCount < 0 || retryCount >= RETRY_DELAYS_MS.length) {
    return { action: 'dead-letter' };
  }
  const nextAttempt = retryCount + 1;
  return {
    action: 'retry',
    retryCount: nextAttempt,
    delayMs: RETRY_DELAYS_MS[retryCount],
    routingKey: `${TEACHER_AUTHENTICATED_EVENT}.retry.${nextAttempt}`,
  };
}

export function parseTeacherAuthenticatedEvent(content: Buffer): TeacherAuthenticatedEvent {
  const value = JSON.parse(content.toString('utf8')) as unknown;
  if (!value || typeof value !== 'object') throw new Error('Evento teacher.authenticated.v1 inválido.');
  const candidate = value as Record<string, unknown>;
  const teacher = candidate.teacher;
  if (
    candidate.eventName !== TEACHER_AUTHENTICATED_EVENT
    || typeof candidate.eventId !== 'string'
    || typeof candidate.sessionId !== 'string'
    || typeof candidate.occurredAt !== 'string'
    || !teacher
    || typeof teacher !== 'object'
    || typeof (teacher as Record<string, unknown>).externalId !== 'string'
  ) {
    throw new Error('Evento teacher.authenticated.v1 inválido.');
  }
  const occurredAt = new Date(candidate.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) throw new Error('Evento teacher.authenticated.v1 inválido.');
  return { ...candidate, occurredAt } as unknown as TeacherAuthenticatedEvent;
}
