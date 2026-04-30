import { Prisma, WhatsAppChat, WhatsAppMessage } from '../../../../prisma/generated/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { MessageDirection } from '../../common/models/enums/message-direction.enum.js';
import { WhatsAppRawMessageDTO } from './entities/whatsapp-message.raw.dto.js';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { KafkaProducerService, KafkaTopics } from '@omnixys/kafka';
import { CurrentUserData } from '@omnixys/security';

interface ChatIdentity {
  primaryId: string; // always used internally (lid preferred)
  phone?: string; // optional normalized phone id (@c.us)
}

interface MessageUser {
  id: string;
  roles?: string[];
}

interface WhatsAppChatRef {
  id?: {
    _serialized?: string;
  };
}

interface IncomingWhatsAppMessage extends WhatsAppRawMessageDTO {
  getChat: () => Promise<WhatsAppChatRef>;
}

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
  ) {}

  /**
   * Entry point for incoming WhatsApp messages
   */
  @OnEvent('whatsapp.incoming')
  async handleIncomingEvent(msg: IncomingWhatsAppMessage): Promise<void> {
    await this.handleIncoming(msg);
  }

  /**
   * Handles incoming WhatsApp messages using a single-chat strategy.
   *
   * Core principle:
   * - Always store ONE chat per person
   * - Prefer lid as primaryId
   * - Enrich phone when available
   */
  async handleIncoming(msg: IncomingWhatsAppMessage): Promise<void> {
    const identity = await this.resolveChatIdentity(msg);

    if (identity.primaryId.includes('@g.us')) {
      return;
    }

    try {
      const chat = await this.findOrCreateChat(identity, msg);
      const savedMessage = await this.createInboundMessage(chat, msg);

      await this.updateChatMetadata(chat.id, msg.body);
      if (!savedMessage) {
        return;
      }

      await this.kafka.send({
        topic: KafkaTopics.gateway.createWhatsappMessage,
        payload: {
          key: savedMessage.chatId,
          value: {
            id: savedMessage.id,
            chatId: savedMessage.chatId,
            direction: savedMessage.direction,
            from: savedMessage.from,
            to: savedMessage.to,
            body: savedMessage.body,
            createdAt: savedMessage.createdAt,
          },
        },
        meta: {
          clazz: this.constructor.name,
          type: 'EVENT',
          service: 'message-service',
          operation: 'Incoming WhatsApp Message',
          version: '1',
          actorId: 'system',
          tenantId: 'omnixys',
        },
      });
    } catch (error) {
      this.logger.error('handleIncoming failed', error);
    }
  }

  /**
   * Handles outgoing messages.
   *
   * Critical behavior:
   * - NEVER create a second chat if a lid chat exists
   * - Always enrich existing chat with phone
   */
  async createOutgoing(
    phone: string,
    message: string,
    user: CurrentUserData,
  ): Promise<WhatsAppMessage> {
    const phoneChatId = this.normalizeToChatId(phone);

    // 1. Try to find existing chat by phone OR existing enriched chat
    let chat = await this.prisma.whatsAppChat.findFirst({
      where: {
        OR: [{ chatId: phoneChatId }, { phone: phoneChatId }],
      },
    });

    // 2. If not found → try to enrich latest lid chat WITHOUT phone
    if (!chat) {
      const lidCandidate = await this.prisma.whatsAppChat.findFirst({
        where: {
          phone: null,
          chatId: { contains: '@lid' },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      if (lidCandidate) {
        chat = await this.prisma.whatsAppChat.update({
          where: { id: lidCandidate.id },
          data: {
            phone: phoneChatId,
          },
        });
      }
    }

    // 3. If still no chat → create new
    chat ??= await this.prisma.whatsAppChat.create({
      data: {
        chatId: phoneChatId,
        phone: phoneChatId,
        isGroup: false,
      },
    });

    // Access control
    if (chat.assignedTo && chat.assignedTo !== user.id && !user.role?.includes('ADMIN')) {
      throw new Error('Forbidden');
    }

    const [savedMessage] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.create({
        data: {
          chatRefId: chat.id,
          chatId: chat.chatId,
          direction: MessageDirection.OUTBOUND,
          from: user.id,
          to: chat.phone ?? chat.chatId, // always send to phone if available
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

    await this.kafka.send({
      topic: KafkaTopics.whatsapp.outgoing,
      payload: {
        key: savedMessage.chatId,
        value: {
          messageId: savedMessage.id,
          to: chat.phone ?? chat.chatId,
          message,
        },
      },
      meta: {
        clazz: this.constructor.name,
        type: 'COMMAND',
        service: 'message-service',
        operation: 'Send WhatsApp Message',
        version: '1',
        actorId: user.id,
        tenantId: 'omnixys',
      },
    });

    await this.kafka.send({
      topic: KafkaTopics.gateway.createWhatsappMessage,
      payload: {
        key: savedMessage.chatId,
        value: {
          id: savedMessage.id,
          chatId: savedMessage.chatId,
          direction: savedMessage.direction,
          from: savedMessage.from,
          to: savedMessage.to,
          body: savedMessage.body,
          createdAt: savedMessage.createdAt,
        },
      },
      meta: {
        clazz: this.constructor.name,
        type: 'EVENT',
        service: 'message-service',
        operation: 'Outgoing Message Created',
        version: '1',
        actorId: user.id,
        tenantId: 'omnixys',
      },
    });

    return savedMessage;
  }

  async createOutgoing2(
    chatId: string,
    message: string,
    user: CurrentUserData,
  ): Promise<WhatsAppMessage | null> {
    // 1. Try to find existing chat by phone OR existing enriched chat
    const chat = await this.prisma.whatsAppChat.findFirst({
      where: {
        chatId,
      },
    });

    if (!chat) {
      return null;
    }

    // Access control
    if (chat.assignedTo && chat.assignedTo !== user.id && !user.role?.includes('ADMIN')) {
      throw new Error('Forbidden');
    }

    const [savedMessage] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.create({
        data: {
          chatRefId: chat.id,
          chatId: chat.chatId,
          direction: MessageDirection.OUTBOUND,
          from: user.id,
          to: chat.phone ?? chat.chatId, // always send to phone if available
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

    await this.kafka.send({
      topic: KafkaTopics.whatsapp.outgoing,
      payload: {
        key: savedMessage.chatId,
        value: {
          messageId: savedMessage.id,
          to: chat.phone ?? chat.chatId,
          message,
        },
      },
      meta: {
        clazz: this.constructor.name,
        type: 'COMMAND',
        service: 'message-service',
        operation: 'Send WhatsApp Message',
        version: '1',
        actorId: user.id,
        tenantId: 'omnixys',
      },
    });

    await this.kafka.send({
      topic: KafkaTopics.gateway.createWhatsappMessage,
      payload: {
        key: savedMessage.chatId,
        value: {
          id: savedMessage.id,
          chatId: savedMessage.chatId,
          direction: savedMessage.direction,
          from: savedMessage.from,
          to: savedMessage.to,
          body: savedMessage.body,
          createdAt: savedMessage.createdAt,
        },
      },
      meta: {
        clazz: this.constructor.name,
        type: 'EVENT',
        service: 'message-service',
        operation: 'Outgoing Message Created',
        version: '1',
        actorId: user.id,
        tenantId: 'omnixys',
      },
    });

    return savedMessage;
  }

  /**
   * Fetch messages for a chat with access control
   */
  async getMessages(chatId: string, user: MessageUser): Promise<WhatsAppMessage[]> {
    const chat = await this.prisma.whatsAppChat.findUnique({
      where: { chatId },
    });

    if (!chat) {
      throw new Error('Chat not found');
    }

    if (chat.assignedTo && chat.assignedTo !== user.id && !user.roles?.includes('ADMIN')) {
      throw new Error('Forbidden');
    }

    return this.prisma.whatsAppMessage.findMany({
      where: { chatRefId: chat.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  /**
   * Finds existing chat or creates new one.
   * Also upgrades phone information if available.
   */
  private async findOrCreateChat(
    identity: ChatIdentity,
    msg: IncomingWhatsAppMessage,
  ): Promise<WhatsAppChat> {
    let chat = await this.prisma.whatsAppChat.findFirst({
      where: {
        OR: [
          { chatId: identity.primaryId },
          ...(identity.phone ? [{ phone: identity.phone }] : []),
        ],
      },
    });

    if (chat) {
      // upgrade with phone if missing
      if (identity.phone && !chat.phone) {
        chat = await this.prisma.whatsAppChat.update({
          where: { id: chat.id },
          data: {
            phone: identity.phone,
          },
        });
      }

      // upgrade to lid if needed
      if (identity.primaryId.includes('@lid') && chat.chatId !== identity.primaryId) {
        chat = await this.prisma.whatsAppChat.update({
          where: { id: chat.id },
          data: {
            chatId: identity.primaryId,
          },
        });
      }

      return chat;
    }

    return this.prisma.whatsAppChat.create({
      data: {
        chatId: identity.primaryId,
        phone: identity.phone,
        isGroup: false,
        name: msg._data?.notifyName,
      },
    });
  }

  /**
   * Creates inbound message with duplicate protection
   */
  private async createInboundMessage(
    chat: WhatsAppChat,
    msg: IncomingWhatsAppMessage,
  ): Promise<WhatsAppMessage | null> {
    try {
      return await this.prisma.whatsAppMessage.create({
        data: {
          chatRefId: chat.id,
          chatId: chat.chatId,
          direction: MessageDirection.INBOUND,
          from: chat.chatId,
          to: msg.to,
          body: msg.body,
          messageId: msg.id?._serialized,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.debug('Duplicate message ignored');
        return null;
      }
      throw error;
    }
  }

  /**
   * Updates chat metadata
   */
  private async updateChatMetadata(chatId: string, message: string): Promise<void> {
    await this.prisma.whatsAppChat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: message?.slice(0, 100),
      },
    });
  }

  /**
   * Normalizes phone into WhatsApp chat format
   */
  private normalizeToChatId(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (!cleaned) {
      throw new Error('Invalid phone number');
    }
    return `${cleaned}@c.us`;
  }

  /**
   * Resolves identity from WhatsApp message.
   *
   * Guarantees:
   * - primaryId always exists
   * - prefers lid over phone
   */
  private async resolveChatIdentity(msg: IncomingWhatsAppMessage): Promise<ChatIdentity> {
    let lid: string | undefined;
    let phone: string | undefined;

    if (msg.from?.includes('@lid')) {
      lid = msg.from;
    }
    if (msg.from?.includes('@c.us')) {
      phone = msg.from;
    }

    if (msg.fromMe && msg.to?.includes('@c.us')) {
      phone = msg.to;
    }

    try {
      const chat = await msg.getChat();
      const id = chat?.id?._serialized;

      if (id?.includes('@lid')) {
        lid = id;
      }
      if (id?.includes('@c.us')) {
        phone = id;
      }
    } catch (error) {
      this.logger.debug('Could not resolve chat through WhatsApp API', error);
    }

    const primaryId = lid ?? phone;

    if (!primaryId) {
      this.logger.error('Cannot resolve identity', {
        from: msg.from,
        to: msg.to,
      });
      throw new Error('Cannot resolve chat identity');
    }

    return { primaryId, phone };
  }
}
