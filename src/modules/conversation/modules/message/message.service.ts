import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '../../../../prisma/generated/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { MessageDirection } from '../../common/models/enums/message-direction.enum.js';
import { GraphQLPubSubAdapter } from '../pubsub/pubsub.adapter.js';
import { MessageQueueService } from './message-queue.service.js';
import { Injectable, Logger } from '@nestjs/common';
import { CurrentUserData } from '@omnixys/security';



@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubSub: GraphQLPubSubAdapter,
    private readonly queue: MessageQueueService,
  ) {}

  @OnEvent('whatsapp.incoming')
  async handleIncomingEvent(msg: any) {
    await this.handleIncoming(msg);
  }

  /**
   * Handle incoming WhatsApp message
   */
  async handleIncoming(msg: any): Promise<void> {
    const chatId = msg.from;

    // 🔥 Filter (only private chats)
    if (!chatId.endsWith('@c.us')) return;
    if (chatId.includes('@g.us')) return;

    try {
      const chat = await this.prisma.whatsAppChat.upsert({
        where: { chatId },
        update: {
          updatedAt: new Date(),
        },
        create: {
          chatId,
          isGroup: msg.from.includes('@g.us'),
        },
      });

      let savedMessage;

      try {
        savedMessage = await this.prisma.whatsAppMessage.create({
          data: {
            chatRefId: chat.id,
            chatId,
            direction: MessageDirection.INBOUND,
            from: msg.from,
            to: msg.to,
            body: msg.body,
            messageId: msg.id?._serialized,
          },
        });
      } catch (error: any) {
        // 🔥 Duplicate protection (DB-level)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          this.logger.debug('Duplicate message ignored');
          return;
        }

        throw error;
      }

      // 🔥 Transaction: update chat metadata
      await this.prisma.whatsAppChat.update({
        where: { id: chat.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: msg.body?.slice(0, 100),
        },
      });

      // 🔥 Realtime push
      await this.pubSub.publish('whatsapp.message', {
        whatsappMessage: savedMessage,
      });
    } catch (err) {
      this.logger.error('handleIncoming failed', err);
    }
  }

  /**
   * Send outgoing message (write to DB + realtime)
   */
  async createOutgoing(phone: string, message: string, user: CurrentUserData) {
    const chatId = this.normalizeToChatId(phone);

    // 🔥 UPSERT statt findUnique
    const chat = await this.prisma.whatsAppChat.upsert({
      where: { chatId },
      update: {},
      create: {
        chatId,
        isGroup: false,
      },
    });

    // 🔒 Access Control
    if (chat.assignedTo && chat.assignedTo !== user.id && !user.roles?.includes('ADMIN')) {
      throw new Error('Forbidden');
    }

    const [savedMessage] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.create({
        data: {
          chatRefId: chat.id,
          chatId,
          direction: MessageDirection.OUTBOUND,
          from: user.id,
          to: chatId,
          body: message,
          status: 'QUEUED',
        },
      }),
      this.prisma.whatsAppChat.update({
        where: { id: chat.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: message.slice(0, 100),
        },
      }),
    ]);

    await this.queue.enqueueOutgoing({
      chatId,
      message,
      messageDbId: savedMessage.id,
    });

    await this.pubSub.publish('whatsapp.message', {
      whatsappMessage: savedMessage,
    });

    return savedMessage;
  }

  /**
   * Get messages for a chat (secured)
   */
  async getMessages(chatId: string, user: any) {
    try {
      const chat = await this.prisma.whatsAppChat.findUnique({
        where: { chatId },
      });

      if (!chat) {
        throw new Error('Chat not found');
      }

      // 🔒 Access control (Admin override)
      if (chat.assignedTo && chat.assignedTo !== user.id && !user.roles?.includes('ADMIN')) {
        throw new Error('Forbidden');
      }

      return this.prisma.whatsAppMessage.findMany({
        where: { chatRefId: chat.id },
        orderBy: { createdAt: 'asc' },
        take: 100, // 🔥 prevent DB overload
      });
    } catch (err) {
      this.logger.error('getMessages failed', err);
      throw err;
    }
  }

  private normalizeToChatId(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');

    if (!cleaned) {
      throw new Error('Invalid phone number');
    }

    return `${cleaned}@c.us`;
  }
}
