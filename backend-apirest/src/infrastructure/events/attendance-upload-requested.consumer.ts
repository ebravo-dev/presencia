import { connect, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import {
  ATTENDANCE_UPLOAD_REQUESTED_EVENT,
  attendanceUploadRequestedEventSchema,
} from '../../domain/events/attendance-upload-requested.event.js';
import type { ProcessAttendanceUploadRequestedUseCase } from '../../application/use-cases/process-attendance-upload-requested.use-case.js';

const DOMAIN_EXCHANGE = 'presencia.domain.v1';
const RETRY_EXCHANGE = 'presencia.domain.retry.v1';
const DEAD_LETTER_EXCHANGE = 'presencia.domain.dlx.v1';
const QUEUE = 'presencia.uat-integration.attendance-upload.v1';
const DEAD_QUEUE = 'presencia.uat-integration.dead.v1';
const CONSUMER = 'uat-integration.attendance-upload.v1';
const RETRY_DELAYS = [5_000, 30_000, 300_000] as const;

export class AttendanceUploadRequestedConsumer {
  private connection: ChannelModel | undefined;
  private channel: ConfirmChannel | undefined;
  private consumerTag: string | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly rabbitmqUrl: string,
    private readonly useCase: ProcessAttendanceUploadRequestedUseCase,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async start(): Promise<void> {
    this.stopping = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.channel && this.consumerTag) await this.channel.cancel(this.consumerTag).catch(() => undefined);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.connection = undefined;
    this.channel = undefined;
    this.consumerTag = undefined;
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
      const consumer = await channel.consume(QUEUE, (message) => {
        if (message) void this.consume(message);
      }, { noAck: false });
      this.connection = connection;
      this.channel = channel;
      this.consumerTag = consumer.consumerTag;
      connection.on('error', (error) => this.logger.error({ err: error }, 'Error en consumidor de subidas Attendance.'));
      connection.on('close', () => {
        this.connection = undefined;
        this.channel = undefined;
        this.consumerTag = undefined;
        if (!this.stopping) this.scheduleReconnect();
      });
      this.logger.info({ queue: QUEUE }, 'Consumidor durable de subidas Attendance conectado.');
    } catch (error) {
      this.logger.warn({ err: error }, 'RabbitMQ no está disponible para consumir subidas Attendance.');
      this.scheduleReconnect();
    }
  }

  private async configure(channel: ConfirmChannel): Promise<void> {
    await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(DEAD_QUEUE, { durable: true });
    await channel.bindQueue(DEAD_QUEUE, DEAD_LETTER_EXCHANGE, '#');
    await channel.assertQueue(QUEUE, { durable: true, arguments: { 'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE } });
    await channel.bindQueue(QUEUE, DOMAIN_EXCHANGE, ATTENDANCE_UPLOAD_REQUESTED_EVENT);
    for (const [index, delay] of RETRY_DELAYS.entries()) {
      const attempt = index + 1;
      const routingKey = `${ATTENDANCE_UPLOAD_REQUESTED_EVENT}.retry.${attempt}`;
      const queue = `${QUEUE}.retry.${attempt}`;
      await channel.assertQueue(queue, {
        durable: true,
        arguments: {
          'x-message-ttl': delay,
          'x-dead-letter-exchange': DOMAIN_EXCHANGE,
          'x-dead-letter-routing-key': ATTENDANCE_UPLOAD_REQUESTED_EVENT,
        },
      });
      await channel.bindQueue(queue, RETRY_EXCHANGE, routingKey);
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
      const processed = await this.prisma.processedDomainEvent.findUnique({
        where: { eventId_consumer: { eventId, consumer: CONSUMER } },
      });
      if (processed) return channel.ack(message);
      const event = attendanceUploadRequestedEventSchema.parse(JSON.parse(message.content.toString('utf8')));
      await this.useCase.execute(event);
      await this.prisma.processedDomainEvent.create({ data: { eventId, consumer: CONSUMER } });
      channel.ack(message);
    } catch (error) {
      await this.retryOrDeadLetter(message, error);
    }
  }

  private async retryOrDeadLetter(message: ConsumeMessage, error: unknown): Promise<void> {
    const channel = this.channel;
    if (!channel) return;
    const retryCount = Number(message.properties.headers?.['x-retry-count'] ?? 0);
    const nextAttempt = retryCount + 1;
    const exhausted = nextAttempt > RETRY_DELAYS.length;
    channel.publish(
      exhausted ? DEAD_LETTER_EXCHANGE : RETRY_EXCHANGE,
      exhausted ? ATTENDANCE_UPLOAD_REQUESTED_EVENT : `${ATTENDANCE_UPLOAD_REQUESTED_EVENT}.retry.${nextAttempt}`,
      message.content,
      {
        ...message.properties,
        persistent: true,
        headers: {
          ...message.properties.headers,
          'x-retry-count': nextAttempt,
          'x-last-error': (error instanceof Error ? error.message : 'Unknown error').slice(0, 2_000),
        },
      },
    );
    await channel.waitForConfirms();
    channel.ack(message);
    this.logger.warn({ eventId: message.properties.messageId, nextAttempt, exhausted, err: error }, 'Subida Attendance reprogramada.');
  }
}
