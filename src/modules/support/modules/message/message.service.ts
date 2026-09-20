import { env } from '../../../../config/env.js';
import { DispatchService } from '../../../../modules/messages/services/dispatch.service.js';
import {
  ConversationAccessDeniedException,
  ConversationNotFoundException,
  ConversationClosedException,
} from '../../../../modules/notification/errors/notification.error.js';
import type { SupportConversation, SupportMessage } from '../../../../prisma/generated/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { MappingService, normalizeSupportExternalId } from '../mapping/mapping.service.js';
import { Injectable } from '@nestjs/common';
import { ValkeyPubSubService } from '@omnixys/cache-ts';
import { EventPermissionKey } from '@omnixys/contracts-ts';
import type {
  ConversationChannel,
  SupportMessageReceivedDTO,
  EmailOutboundDTO,
  ConversationChannelMessageDTO,
} from '@omnixys/contracts-ts';
import { KafkaProducerService, KafkaTopics } from '@omnixys/kafka-ts';
import { OmnixysLogger, type ScopedLogger } from '@omnixys/logger-ts';
import { EventPermissionResolver } from '@omnixys/security-ts';
import type { CurrentUserData } from '@omnixys/security-ts';

const { DEFAULT_TENANT_ID } = env;

@Injectable()
export class MessageService {
  private readonly logger: ScopedLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchService: DispatchService,
    private readonly kafka: KafkaProducerService,
    private readonly valkeyPubSub: ValkeyPubSubService,
    private readonly permissionResolver: EventPermissionResolver,
    private readonly mappings: MappingService,
    omnixysLogger: OmnixysLogger,
  ) {
    this.logger = omnixysLogger.log(MessageService.name, 'service:notification');
  }

  async getMessages(
    conversationId: string,
    user: CurrentUserData,
    limit = 100,
  ): Promise<SupportMessage[]> {
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(conversationId);
    }

    if (!(await this.canAccessMessages(conversation, user))) {
      throw new ConversationAccessDeniedException(conversationId);
    }

    return this.prisma.supportMessage.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Returns messages for an RSVP guest's conversation, resolved strictly by
   * (eventId, invitationId). The invitation has already been validated as a
   * capability before this is called.
   */
  async getMessagesByInvitation(
    eventId: string,
    invitationId: string,
    limit = 100,
  ): Promise<SupportMessage[]> {
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { eventId, invitationId },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(undefined);
    }

    return this.prisma.supportMessage.findMany({
      where: { conversationId: conversation.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async sendMessage(
    conversationId: string,
    data: {
      body?: string;
      mediaUrl?: string;
      mimeType?: string;
    },
    user: CurrentUserData,
  ): Promise<SupportMessage> {
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(conversationId);
    }

    const isGuestOwner = conversation.guestUserId === user.id;
    const canRespond = await this.hasEventPermission(
      conversation.eventId,
      user,
      EventPermissionKey.RespondSupport,
    );

    if (!isGuestOwner && !canRespond) {
      throw new ConversationAccessDeniedException(conversationId);
    }

    return this.performSend(conversation, data, {
      fromGuest: isGuestOwner,
      actorId: user.id,
    });
  }

  /**
   * Sends a message on behalf of an RSVP guest whose invitation has already
   * been validated as a capability. The conversation is resolved strictly by
   * (eventId, invitationId) so a guest can never address another conversation.
   */
  async sendMessageByInvitation(
    eventId: string,
    invitationId: string,
    data: {
      body?: string;
      mediaUrl?: string;
      mimeType?: string;
    },
  ): Promise<SupportMessage> {
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { eventId, invitationId },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(undefined);
    }

    return this.performSend(conversation, data, { fromGuest: true, actorId: undefined });
  }

  private async performSend(
    conversation: SupportConversation,
    data: {
      body?: string;
      mediaUrl?: string;
      mimeType?: string;
    },
    actor: { fromGuest: boolean; actorId?: string },
  ): Promise<SupportMessage> {
    const conversationId = conversation.id;
    const fromGuest = actor.fromGuest;

    if (conversation.status === 'CLOSED') {
      throw new ConversationClosedException(conversationId);
    }

    const [message, updatedConversation] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: {
          conversationId,
          direction: fromGuest ? 'INBOUND' : 'OUTBOUND',
          channel: conversation.channel,
          fromUserId: actor.actorId,
          fromGuest,
          body: data.body,
          mediaUrl: data.mediaUrl,
          mimeType: data.mimeType,
          status: 'SENT',
        },
      }),
      this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: (data.body ?? '(media)').slice(0, 100),
          ...(fromGuest
            ? { unreadCount: { increment: 1 } }
            : { guestUnreadCount: { increment: 1 } }),
        },
      }),
    ]);

    const conversationUnreadCount = updatedConversation.unreadCount;
    const guestUnreadCount = updatedConversation.guestUnreadCount;

    try {
      await this.valkeyPubSub.publish(`unreadCount.updated.${conversationId}`, {
        conversationId,
        unreadCount: conversationUnreadCount,
        guestUnreadCount,
        eventId: conversation.eventId,
      });
    } catch (error) {
      this.logger.warn('Unread realtime publish failed: %o', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await this.valkeyPubSub.publish(`support.event.conversations.${conversation.eventId}`, {
        eventId: conversation.eventId,
        conversationId,
        kind: 'updated',
        unreadCount: conversationUnreadCount,
        guestUnreadCount,
      });
    } catch (error) {
      this.logger.warn('Conversation realtime publish failed: %o', {
        conversationId,
        eventId: conversation.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (conversation.invitationId) {
      try {
        await this.valkeyPubSub.publish(`support.invitation.message.${conversation.invitationId}`, {
          supportMessage: {
            ...message,
            createdAt: message.createdAt.toISOString(),
            deliveredAt: message.deliveredAt?.toISOString(),
            readAt: message.readAt?.toISOString(),
          },
        });
      } catch (error) {
        this.logger.warn('RSVP realtime publish failed: %o', {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.kafka.send({
      topic: fromGuest
        ? KafkaTopics.conversation.guestReplied
        : KafkaTopics.conversation.agentReplied,
      payload: {
        id: message.id,
        conversationId: message.conversationId,
        direction: message.direction,
        channel: message.channel,
        fromUserId: message.fromUserId ?? undefined,
        fromGuest: message.fromGuest,
        body: message.body ?? undefined,
        mediaUrl: message.mediaUrl ?? undefined,
        mimeType: message.mimeType ?? undefined,
        status: message.status,
        createdAt: message.createdAt.toISOString(),
      } satisfies SupportMessageReceivedDTO,
      meta: {
        clazz: this.constructor.name,
        type: 'EVENT',
        service: 'support-message-service',
        operation: fromGuest ? 'Guest Replied' : 'Agent Replied',
        version: '1',
        actorId: actor.actorId,
        tenantId: DEFAULT_TENANT_ID,
      },
    });

    // ── Channel-specific outbound routing ──
    if (conversation.channel === 'EMAIL' && !fromGuest) {
      await this.kafka.send({
        topic: KafkaTopics.email.outboundSend,
        payload: {
          to: conversation.guestContact ?? '',
          subject: conversation.subject ? `Re: ${conversation.subject}` : 'Support Reply',
          body: data.body ?? '',
          inReplyTo: conversation.emailMessageId ?? undefined,
          references: [conversation.emailReferences ?? conversation.emailMessageId]
            .filter(Boolean)
            .join(' '),
          conversationId,
          messageId: message.id,
        } satisfies EmailOutboundDTO,
        meta: {
          clazz: this.constructor.name,
          type: 'COMMAND',
          service: 'support-message-service',
          operation: 'Outbound Email Message',
          version: '1',
          actorId: actor.actorId,
          tenantId: DEFAULT_TENANT_ID,
        },
      });
    } else if (conversation.channel === 'WHATSAPP' && !fromGuest) {
      const recipient = conversation.guestContact ?? '';

      const dispatchResult = await this.dispatchService.dispatch({
        id: message.id,
        channel: conversation.channel,
        recipientId: recipient,
        recipientAddress: recipient,
        body: data.body ?? '',
        contentType: 'TEXT',
        metadata: {
          conversationId,
        },
      });

      await this.prisma.messageDelivery.create({
        data: {
          id: message.id,
          messageId: message.id,
          channel: conversation.channel,
          status: dispatchResult.success ? 'SENT' : 'FAILED',
          providerRef: dispatchResult.providerMessageId,
        },
      });

      if (!dispatchResult.success) {
        this.logger.warn(
          'Dispatch failed for support message: messageId=%s channel=%s error=%s',
          message.id,
          conversation.channel,
          dispatchResult.error,
        );
      }

      await this.kafka.send({
        topic: KafkaTopics.conversation.channelMessage,
        payload: {
          conversationId,
          channel: conversation.channel as ConversationChannel,
          to: recipient,
          body: data.body ?? '',
          externalId: message.id,
        } satisfies ConversationChannelMessageDTO,
        meta: {
          clazz: this.constructor.name,
          type: 'COMMAND',
          service: 'support-message-service',
          operation: 'Outbound Channel Message',
          version: '1',
          actorId: actor.actorId,
          tenantId: DEFAULT_TENANT_ID,
        },
      });
    }

    return message;
  }

  async receiveInboundMessage(data: {
    externalId: string;
    eventId: string;
    from: string;
    senderName?: string;
    body?: string;
    mediaUrl?: string;
    mimeType?: string;
  }): Promise<SupportMessage | null> {
    const canonicalFrom = normalizeSupportExternalId(data.from);
    const mapping = await this.mappings.resolveUniqueInboundMapping(
      'WHATSAPP',
      canonicalFrom,
      data.eventId,
    );

    let message: SupportMessage;
    let conversation: SupportConversation;
    let unreadCount: number;

    if (mapping.conversationId) {
      const existing = await this.prisma.supportMessage.findFirst({
        where: {
          conversationId: mapping.conversationId,
          externalId: data.externalId,
        },
      });
      if (existing) {
        return existing;
      }

      const mappedConversation = await this.prisma.supportConversation.findUnique({
        where: { id: mapping.conversationId },
      });
      if (
        mappedConversation?.eventId !== data.eventId ||
        mappedConversation?.status === 'CLOSED' ||
        mappedConversation?.deletedAt
      ) {
        return null;
      }

      const [createdMessage, updatedConversation] = await this.prisma.$transaction([
        this.prisma.supportMessage.create({
          data: {
            conversationId: mappedConversation.id,
            direction: 'INBOUND',
            channel: 'WHATSAPP',
            fromGuest: true,
            body: data.body,
            mediaUrl: data.mediaUrl,
            mimeType: data.mimeType,
            status: 'DELIVERED',
            externalId: data.externalId,
          },
        }),
        this.prisma.supportConversation.update({
          where: { id: mappedConversation.id },
          data: {
            lastMessageAt: new Date(),
            lastMessagePreview: (data.body ?? '(media)').slice(0, 100),
            unreadCount: { increment: 1 },
          },
        }),
      ]);
      message = createdMessage;
      conversation = mappedConversation;
      unreadCount = updatedConversation.unreadCount;
    } else {
      const senderName = data.senderName?.trim();
      const created = await this.prisma.$transaction(async (tx) => {
        const createdConversation = await tx.supportConversation.create({
          data: {
            eventId: data.eventId,
            guestName: senderName?.length ? senderName : canonicalFrom,
            guestContact: canonicalFrom,
            channel: 'WHATSAPP',
            priority: 'NORMAL',
            status: 'OPEN',
            unreadCount: 1,
            lastMessageAt: new Date(),
            lastMessagePreview: (data.body ?? '(media)').slice(0, 100),
          },
        });
        await tx.conversationMapping.create({
          data: {
            channel: 'WHATSAPP',
            externalId: canonicalFrom,
            eventId: data.eventId,
            conversationId: createdConversation.id,
            mappingType: 'AUTO',
          },
        });
        const createdMessage = await tx.supportMessage.create({
          data: {
            conversationId: createdConversation.id,
            direction: 'INBOUND',
            channel: 'WHATSAPP',
            fromGuest: true,
            body: data.body,
            mediaUrl: data.mediaUrl,
            mimeType: data.mimeType,
            status: 'DELIVERED',
            externalId: data.externalId,
          },
        });
        return { conversation: createdConversation, message: createdMessage };
      });
      message = created.message;
      conversation = created.conversation;
      unreadCount = created.conversation.unreadCount;
    }

    try {
      await this.valkeyPubSub.publish(`support.event.conversations.${conversation.eventId}`, {
        eventId: conversation.eventId,
        conversationId: conversation.id,
        kind: 'updated',
        unreadCount,
        guestUnreadCount: conversation.guestUnreadCount,
      });
    } catch (error) {
      this.logger.warn('WhatsApp conversation realtime publish failed: %o', {
        conversationId: conversation.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await this.kafka.send({
      topic: KafkaTopics.conversation.guestReplied,
      payload: {
        id: message.id,
        conversationId: message.conversationId,
        direction: message.direction,
        channel: message.channel,
        fromGuest: true,
        body: message.body ?? undefined,
        mediaUrl: message.mediaUrl ?? undefined,
        mimeType: message.mimeType ?? undefined,
        status: message.status,
        createdAt: message.createdAt.toISOString(),
      } satisfies SupportMessageReceivedDTO,
      meta: {
        clazz: this.constructor.name,
        type: 'EVENT',
        service: 'support-message-service',
        operation: 'WhatsApp Guest Replied',
        version: '1',
        tenantId: DEFAULT_TENANT_ID,
      },
    });

    return message;
  }

  async findInboundMessage(
    externalId: string,
    from: string,
    eventId?: string,
  ): Promise<SupportMessage | null> {
    const mapping = await this.mappings.resolveUniqueInboundMapping('WHATSAPP', from, eventId);
    if (!mapping.conversationId) {
      return null;
    }
    return this.prisma.supportMessage.findFirst({
      where: { conversationId: mapping.conversationId, externalId },
    });
  }

  private async canAccessMessages(
    conversation: { eventId: string; guestUserId?: string | null },
    user: CurrentUserData,
  ): Promise<boolean> {
    if (conversation.guestUserId === user.id) {
      return true;
    }

    return this.hasEventPermission(conversation.eventId, user, EventPermissionKey.ViewSupport);
  }

  private async hasEventPermission(
    eventId: string,
    user: CurrentUserData,
    permission: EventPermissionKey,
  ): Promise<boolean> {
    const permissions = await this.permissionResolver.getPermissionsForUser(user.id, eventId);
    return permissions.includes(permission);
  }
}
