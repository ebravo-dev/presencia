import { connect, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import type { CoordinationQueryRepository } from '../domain/query.repository.js';
import { parseProjectionEvent } from '../domain/projection-event.js';

const DOMAIN_EXCHANGE = 'presencia.domain.v1';
const RETRY_EXCHANGE = 'presencia.domain.retry.v1';
const DEAD_EXCHANGE = 'presencia.domain.dlx.v1';
const QUEUE = 'presencia.coordination-query.projections.v1';
const DEAD_QUEUE = 'presencia.coordination-query.dead.v1';
const CONSUMER = 'coordination-query.projections.v1';
const EVENTS = [
  'academic.roster_updated.v1', 'academic.group_deactivated.v1',
  'attendance.recorded.v1', 'attendance.corrected.v1',
  'uat.attendance_uploaded.v1', 'uat.attendance_upload_failed.v1',
] as const;
const RETRIES = [5_000, 30_000, 300_000] as const;

export interface ProjectionLogger {
  info(bindings: object, message: string): void;
  warn(bindings: object, message: string): void;
  error(bindings: object, message: string): void;
}

export class ProjectionEventConsumer {
  private connection: ChannelModel | undefined;
  private channel: ConfirmChannel | undefined;
  private consumerTag: string | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stopping = false;

  constructor(
    private readonly repository: CoordinationQueryRepository,
    private readonly rabbitmqUrl: string,
    private readonly logger: ProjectionLogger,
  ) {}

  async start() { this.stopping = false; await this.connect(); }
  isReady() { return this.channel !== undefined; }
  async stop() {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.channel && this.consumerTag) await this.channel.cancel(this.consumerTag).catch(() => undefined);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = undefined; this.connection = undefined; this.consumerTag = undefined; this.reconnectTimer = undefined;
  }

  private async connect() {
    if (this.channel || this.stopping) return;
    try {
      const connection = await connect(this.rabbitmqUrl);
      const channel = await connection.createConfirmChannel();
      await this.configure(channel);
      const consumer = await channel.consume(QUEUE, (message) => { if (message) void this.consume(message); }, { noAck: false });
      this.connection = connection; this.channel = channel; this.consumerTag = consumer.consumerTag;
      connection.on('error', (error) => this.logger.error({ err: error }, 'Coordination Query RabbitMQ error.'));
      connection.on('close', () => {
        this.channel = undefined; this.connection = undefined; this.consumerTag = undefined;
        if (!this.stopping) this.scheduleReconnect();
      });
      this.logger.info({ queue: QUEUE }, 'Coordination Query projection consumer connected.');
    } catch (error) {
      this.logger.warn({ err: error }, 'Coordination Query will reconnect to RabbitMQ.');
      this.scheduleReconnect();
    }
  }

  private async configure(channel: ConfirmChannel) {
    await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });
    await channel.assertExchange(DEAD_EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(DEAD_QUEUE, { durable: true });
    await channel.bindQueue(DEAD_QUEUE, DEAD_EXCHANGE, '#');
    await channel.assertQueue(QUEUE, { durable: true, arguments: { 'x-dead-letter-exchange': DEAD_EXCHANGE } });
    for (const event of EVENTS) {
      await channel.bindQueue(QUEUE, DOMAIN_EXCHANGE, event);
      for (const [index, delay] of RETRIES.entries()) {
        const attempt = index + 1;
        const routingKey = `${event}.coordination.retry.${attempt}`;
        const retryQueue = `${QUEUE}.${event}.retry.${attempt}`;
        await channel.assertQueue(retryQueue, {
          durable: true,
          arguments: { 'x-message-ttl': delay, 'x-dead-letter-exchange': DOMAIN_EXCHANGE, 'x-dead-letter-routing-key': event },
        });
        await channel.bindQueue(retryQueue, RETRY_EXCHANGE, routingKey);
      }
    }
    await channel.prefetch(16);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.stopping) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; void this.connect(); }, 5_000);
    this.reconnectTimer.unref();
  }

  private async consume(message: ConsumeMessage) {
    const channel = this.channel;
    if (!channel) return;
    try {
      const event = parseProjectionEvent(JSON.parse(message.content.toString('utf8')));
      await this.repository.project(event, CONSUMER);
      channel.ack(message);
    } catch (error) {
      await this.retry(message, error);
    }
  }

  private async retry(message: ConsumeMessage, error: unknown) {
    const channel = this.channel;
    if (!channel) return;
    const current = Number(message.properties.headers?.['x-retry-count'] ?? 0);
    const next = current + 1;
    const exhausted = next > RETRIES.length;
    const event = message.fields.routingKey.replace(/\.coordination\.retry\.\d+$/, '');
    channel.publish(exhausted ? DEAD_EXCHANGE : RETRY_EXCHANGE, exhausted ? event : `${event}.coordination.retry.${next}`, message.content, {
      ...message.properties, persistent: true,
      headers: { ...message.properties.headers, 'x-retry-count': next, 'x-last-error': errorText(error) },
    });
    await channel.waitForConfirms();
    channel.ack(message);
    this.logger.warn({ eventId: message.properties.messageId, next, exhausted, err: error }, 'Coordination projection event rescheduled.');
  }
}

function errorText(error: unknown) { return (error instanceof Error ? error.message : 'Unknown projection error').slice(0, 2_000); }
