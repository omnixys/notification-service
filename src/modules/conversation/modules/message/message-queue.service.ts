import { Injectable, Logger } from '@nestjs/common';
import { ValkeyStreamService } from '@omnixys/cache';

@Injectable()
export class MessageQueueService {
  private readonly logger = new Logger(MessageQueueService.name);

  constructor(private readonly stream: ValkeyStreamService) {}

  async enqueueOutgoing(payload: { chatId: string; message: string; messageDbId: string }) {
    await this.stream.enqueue('whatsapp:outgoing', payload);

    this.logger.debug('Message queued');
  }
}
