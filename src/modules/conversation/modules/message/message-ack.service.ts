// modules/message/message-ack.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class MessageAckService {
  private readonly logger = new Logger(MessageAckService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleAck(messageId: string, ack: number) {
    let status: 'SENT' | 'DELIVERED' | 'READ';

    switch (ack) {
      case 1:
        status = 'SENT';
        break;
      case 2:
        status = 'DELIVERED';
        break;
      case 3:
        status = 'READ';
        break;
      default:
        return;
    }

    await this.prisma.whatsAppMessage.updateMany({
      where: { messageId },
      data: { status },
    });

    this.logger.debug(`Message ${messageId} updated → ${status}`);
  }
}
