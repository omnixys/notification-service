import { PrismaService } from '../../../../prisma/prisma.service.js';
import { WhatsAppWebProvider } from '../../../messages/providers/whatsapp/whatsapp-web.provider.js';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ValkeyStreamService } from '@omnixys/cache';

@Injectable()
export class MessageConsumerService implements OnModuleInit {
  private readonly logger = new Logger(MessageConsumerService.name);

  private running = true;

  constructor(
    private readonly stream: ValkeyStreamService,
    private readonly whatsapp: WhatsAppWebProvider,
    private readonly prisma: PrismaService,
  ) {}

  // async onModuleInit() {
  //   this.startWorker();
  // }

  async onModuleInit() {
    setImmediate(() => this.startWorker()); // 🔥 entkoppelt vom Boot
  }

  private async startWorker() {
    while (this.running) {
      await new Promise((r) => setTimeout(r, 10)); 
      
      const messages = await this.stream.consume(
        'whatsapp:outgoing',
        'whatsapp-group',
        'consumer-1',
        10,
        5000,
      );

      for (const msg of messages) {
        const { chatId, message, messageDbId } = msg.data as any;

        try {
          const sent = await this.whatsapp.send({
            to: chatId,
            message,
          });

          const messageId = sent?.id?._serialized;

          await this.prisma.whatsAppMessage.update({
            where: { id: messageDbId },
            data: {
              status: 'SENT',
              messageId,
            },
          });

          await this.stream.ack('whatsapp:outgoing', 'whatsapp-group', msg.id);
        } catch (err: any) {
          this.logger.error('Send failed', err);

          await this.prisma.whatsAppMessage.update({
            where: { id: messageDbId },
            data: {
              status: 'FAILED',
              error: err.message,
            },
          });
        }
      }
    }
  }
}
