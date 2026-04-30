import { WhatsAppWebProvider } from '../modules/messages/providers/whatsapp/whatsapp-web.provider.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Injectable } from '@nestjs/common';
import {
  KafkaEvent,
  KafkaEventHandler,
  KafkaProducerService,
  KafkaTopics,
} from '@omnixys/kafka';
import { OmnixysLogger } from '@omnixys/logger';
import { WhatsappOutgoingDTO, WhatsappOutgoingValueDTO } from '@omnixys/shared';

const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 30_000;

@KafkaEventHandler('Notification')
@Injectable()
export class WhatsAppHandler {
  private readonly log;

  constructor(
    private readonly whatsapp: WhatsAppWebProvider,
    private readonly prisma: PrismaService,
    readonly omnixysLogger: OmnixysLogger,
    private readonly kafka: KafkaProducerService,
  ) {
    this.log = omnixysLogger.log(this.constructor.name);
  }

  @KafkaEvent(KafkaTopics.whatsapp.outgoing)
  async handleOutgoing(payload: WhatsappOutgoingDTO): Promise<void> {
    await this.process(payload.value);
  }

  // 🔁 RETRY HANDLER
  @KafkaEvent(KafkaTopics.whatsapp.retry)
  async handleRetry(event: WhatsappOutgoingDTO): Promise<void> {
    await this.process(event.value);
  }

  private async process(payload: WhatsappOutgoingValueDTO): Promise<void> {
    const { messageId, to, message } = payload;

    const retryCount = payload.retryCount ?? 0;

    const existing = await this.prisma.whatsAppMessage.findUnique({
      where: { id: messageId },
      select: { status: true },
    });

    if (!existing) {
      this.log.warn(`Message not found: ${messageId}`);
      return;
    }

    if (
      existing.status === 'SENT' ||
      existing.status === 'DELIVERED' ||
      existing.status === 'READ'
    ) {
      this.log.debug(`Skip already processed message ${messageId}`);
      return;
    }

    try {
      const sent = await this.whatsapp.send({
        to,
        message,
      });

      const externalId = sent?.id?._serialized;

      await this.prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: 'SENT',
          messageId: externalId,
        },
      });

      this.log.info(`Message sent: ${messageId}`);
    } catch (err: unknown) {
      this.log.error(`Send failed (${retryCount})`, this.toErrorMessage(err));

      if (this.isRetryable(err) && retryCount < MAX_RETRIES) {
        await this.scheduleRetry(payload, retryCount);
        return;
      }

      await this.moveToDLQ(payload, err);
    }
  }

  private async scheduleRetry(
    payload: WhatsappOutgoingValueDTO,
    retryCount: number,
  ): Promise<void> {
    const nextRetry = retryCount + 1;

    const delay = this.calculateBackoff(nextRetry);

    this.log.warn(`Retrying message (${nextRetry}) in ${delay}ms`);

    await new Promise((r) => setTimeout(r, delay));

    await this.kafka.send({
      topic: KafkaTopics.whatsapp.retry,
      payload: {
        key: payload.messageId,
        value: {
          ...payload,
          retryCount: nextRetry,
        },
      },
      meta: {
        clazz: this.constructor.name,
        type: 'COMMAND',
        service: 'notification-service',
        operation: 'Retry WhatsApp Message',
        version: '1',
        actorId: 'system',
        tenantId: 'omnixys',
      },
    });
  }

  // 💀 DLQ
  private async moveToDLQ(
    payload: WhatsappOutgoingValueDTO,
    err: unknown,
  ): Promise<void> {
    const errorMessage = this.toErrorMessage(err);

    this.log.error(`Moving to DLQ: ${payload.messageId}`);

    await this.prisma.whatsAppMessage.update({
      where: { id: payload.messageId },
      data: {
        status: 'FAILED',
        error: errorMessage,
      },
    });

    await this.kafka.send({
      topic: KafkaTopics.whatsapp.dlq,
      payload: {
        key: payload.messageId,
        value: {
          ...payload,
          error: errorMessage,
          failedAt: new Date().toISOString(),
        },
      },
      meta: {
        clazz: this.constructor.name,
        type: 'EVENT',
        service: 'notification-service',
        operation: 'WhatsApp Message Moved To DLQ',
        version: '1',
        actorId: 'system',
        tenantId: 'omnixys',
      },
    });
  }

  // 📈 EXPONENTIAL BACKOFF
  private calculateBackoff(retry: number): number {
    return Math.min(1000 * 2 ** retry, MAX_BACKOFF_MS);
  }

  private toErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  // 🔍 ERROR CLASSIFICATION
  private isRetryable(err: unknown): boolean {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';

    // WhatsApp typical retry cases
    if (
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('rate') ||
      msg.includes('429') ||
      msg.includes('temporarily unavailable') ||
      msg.includes('socket') ||
      msg.includes('disconnected')
    ) {
      return true;
    }

    return false;
  }
}
