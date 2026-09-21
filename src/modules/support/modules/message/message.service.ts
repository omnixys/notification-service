import { DispatchService } from '../../../../modules/messages/services/dispatch.service.js';
import {
  ConversationAccessDeniedException,
  ConversationNotFoundException,
  ConversationClosedException,
} from '../../../../modules/notification/errors/notification.error.js';
import type {
  InternalMessage,
  SupportConversation,
  SupportMessage,
} from '../../../../prisma/generated/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { toApiChannel } from '../../../internal/entities/internal-conversation.entity.js';
import type { InternalConversationChannel } from '../../../internal/entities/internal-conversation.entity.js';
import { TenantRouteService } from '../../common/tenant-route.service.js';
import { MappingService, normalizeSupportExternalId } from '../mapping/mapping.service.js';
import { ConversationOutboxService } from '../outbox/conversation-outbox.service.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ValkeyPubSubService } from '@omnixys/cache-ts';
import { EventPermissionKey } from '@omnixys/contracts-ts';
import type {
  SupportMessageReceivedDTO,
  EmailOutboundDTO,
  InternalMessageSentDTO,
} from '@omnixys/contracts-ts';
import { KafkaProducerService, KafkaTopics } from '@omnixys/kafka-ts';
import { OmnixysLogger, type ScopedLogger } from '@omnixys/logger-ts';
import { EventPermissionResolver } from '@omnixys/security-ts';
import type { CurrentUserData } from '@omnixys/security-ts';

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
    private readonly tenantRoutes: TenantRouteService = new TenantRouteService(),
    @Optional()
    @Inject(ConversationOutboxService)
    private readonly outbox?: ConversationOutboxService,
  ) {
    this.logger = omnixysLogger.log(MessageService.name, 'service:notification');
  }

  async getMessages(
    conversationId: string,
    user: CurrentUserData,
    limit = 100,
  ): Promise<SupportMessage[]> {
    const tenantId = this.tenantRoutes.requireCurrentTenant();
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { id: conversationId, tenantId },
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
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { eventId, tenantId, invitationId },
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
    const tenantId = this.tenantRoutes.requireCurrentTenant();
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { id: conversationId, tenantId },
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
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { eventId, tenantId, invitationId },
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

    const tenantId =
      conversation.tenantId ?? this.tenantRoutes.requireEventTenant(conversation.eventId);
    const { message, updatedConversation } = await this.prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({
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
      });
      const updatedConversation = await tx.supportConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: (data.body ?? '(media)').slice(0, 100),
          ...(fromGuest
            ? { unreadCount: { increment: 1 } }
            : { guestUnreadCount: { increment: 1 } }),
        },
      });
      const payload = {
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
      } satisfies SupportMessageReceivedDTO;
      const eventTopic = fromGuest
        ? KafkaTopics.conversation.guestReplied
        : KafkaTopics.conversation.agentReplied;
      if (this.outbox) {
        await this.outbox.enqueue(tx, {
          topic: eventTopic,
          payload,
          tenantId,
          key: conversationId,
          actorId: actor.actorId,
          operation: fromGuest ? 'Guest Replied' : 'Agent Replied',
        });
      } else {
        await this.kafka.send({
          topic: eventTopic,
          payload,
          meta: {
            type: 'EVENT',
            service: 'support-message-service',
            operation: fromGuest ? 'Guest Replied' : 'Agent Replied',
            actorId: actor.actorId,
            tenantId,
          },
        });
      }
      if (conversation.channel === 'EMAIL' && !fromGuest) {
        const emailPayload = {
          to: conversation.guestContact ?? '',
          subject: conversation.subject ? `Re: ${conversation.subject}` : 'Support Reply',
          body: data.body ?? '',
          inReplyTo: conversation.emailMessageId ?? undefined,
          references: [conversation.emailReferences ?? conversation.emailMessageId]
            .filter(Boolean)
            .join(' '),
          conversationId,
          messageId: message.id,
        } satisfies EmailOutboundDTO;
        if (this.outbox) {
          await this.outbox.enqueue(tx, {
            topic: KafkaTopics.email.outboundSend,
            payload: emailPayload,
            tenantId,
            key: conversationId,
            actorId: actor.actorId,
            type: 'COMMAND',
            operation: 'Outbound Email Message',
          });
        } else {
          await this.kafka.send({
            topic: KafkaTopics.email.outboundSend,
            payload: emailPayload,
            meta: {
              type: 'COMMAND',
              service: 'support-message-service',
              operation: 'Outbound Email Message',
              actorId: actor.actorId,
              tenantId,
            },
          });
        }
      }
      return { message, updatedConversation };
    });

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

    // ── Channel-specific outbound routing ──
    if (conversation.channel === 'WHATSAPP' && !fromGuest) {
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
    }

    return message;
  }

  async receiveInboundMessage(data: {
    externalId: string;
    tenantId: string;
    eventId: string;
    from: string;
    senderName?: string;
    body?: string;
    mediaUrl?: string;
    mimeType?: string;
  }): Promise<SupportMessage | InternalMessage | null> {
    const canonicalFrom = normalizeSupportExternalId(data.from);
    const mapping = await this.mappings.resolveUniqueInboundMapping(
      'WHATSAPP',
      canonicalFrom,
      data.eventId,
      data.tenantId,
    );

    if (mapping.internalConversationId) {
      return this.receiveInternalWhatsAppMessage(
        mapping.internalConversationId,
        data,
        canonicalFrom,
      );
    }

    if (!mapping.conversationId) {
      const staff = await this.resolveEventStaffByPhone(data.eventId, canonicalFrom);
      if (staff) {
        return this.createInternalWhatsAppConversation(data, canonicalFrom, staff);
      }
    }

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
        mappedConversation?.tenantId !== data.tenantId ||
        mappedConversation?.status === 'CLOSED' ||
        mappedConversation?.deletedAt
      ) {
        return null;
      }

      const { createdMessage, updatedConversation } = await this.prisma.$transaction(async (tx) => {
        const createdMessage = await tx.supportMessage.create({
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
            provider: 'EVOLUTION',
          },
        });
        const updatedConversation = await tx.supportConversation.update({
          where: { id: mappedConversation.id },
          data: {
            lastMessageAt: new Date(),
            lastMessagePreview: (data.body ?? '(media)').slice(0, 100),
            unreadCount: { increment: 1 },
          },
        });
        await this.enqueueSupportMessageEvent(
          tx,
          createdMessage,
          data.tenantId,
          'WhatsApp Guest Replied',
        );
        return { createdMessage, updatedConversation };
      });
      message = createdMessage;
      conversation = mappedConversation;
      unreadCount = updatedConversation.unreadCount;
    } else {
      const senderName = data.senderName?.trim();
      const created = await this.prisma.$transaction(async (tx) => {
        const createdConversation = await tx.supportConversation.create({
          data: {
            tenantId: data.tenantId,
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
            tenantId: data.tenantId,
            channel: 'WHATSAPP',
            externalId: canonicalFrom,
            eventId: data.eventId,
            conversationId: createdConversation.id,
            mappingType: 'AUTO',
            provider: 'EVOLUTION',
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
            provider: 'EVOLUTION',
          },
        });
        await this.enqueueSupportMessageEvent(
          tx,
          createdMessage,
          data.tenantId,
          'WhatsApp Guest Replied',
        );
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

    return message;
  }

  async findInboundMessage(
    externalId: string,
    from: string,
    eventId?: string,
    tenantId?: string,
  ): Promise<SupportMessage | InternalMessage | null> {
    if (!eventId || !tenantId) {
      return null;
    }
    const supportMessage = await this.prisma.supportMessage.findFirst({
      where: {
        provider: 'EVOLUTION',
        externalId,
        conversation: { eventId, tenantId },
      },
    });
    if (supportMessage) {
      return supportMessage;
    }
    const internalMessage = await this.prisma.internalMessage.findFirst({
      where: {
        provider: 'EVOLUTION',
        externalId,
        conversation: { eventId, tenantId },
      },
    });
    if (internalMessage) {
      return internalMessage;
    }
    const mapping = await this.mappings.resolveUniqueInboundMapping(
      'WHATSAPP',
      from,
      eventId,
      tenantId,
    );
    if (!mapping.conversationId) {
      return mapping.internalConversationId
        ? this.prisma.internalMessage.findFirst({
            where: {
              conversationId: mapping.internalConversationId,
              externalId,
              provider: 'EVOLUTION',
            },
          })
        : null;
    }
    return this.prisma.supportMessage.findFirst({
      where: {
        conversationId: mapping.conversationId,
        externalId,
        conversation: tenantId ? { tenantId } : undefined,
      },
    });
  }

  private async receiveInternalWhatsAppMessage(
    conversationId: string,
    data: {
      externalId: string;
      tenantId: string;
      eventId: string;
      senderName?: string;
      body?: string;
    },
    canonicalFrom: string,
  ): Promise<InternalMessage | null> {
    const conversation = await this.prisma.internalConversation.findFirst({
      where: { id: conversationId, tenantId: data.tenantId, eventId: data.eventId, isActive: true },
      include: { participants: { where: { leftAt: null }, select: { userId: true } } },
    });
    if (!conversation) {
      return null;
    }
    const senderId = conversation.participants[0]?.userId;
    if (!senderId) {
      return null;
    }
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.internalMessage.create({
        data: {
          conversationId,
          senderId,
          body: data.body ?? '',
          direction: 'INBOUND',
          channel: 'WHATSAPP',
          provider: 'EVOLUTION',
          externalId: data.externalId,
        },
      });
      await this.enqueueInternalMessageEvent(
        tx,
        created,
        conversation.participants.map(({ userId }) => userId),
        data.tenantId,
      );
      return created;
    });
    this.logger.debug('Routed WhatsApp inbound to internal conversation: %o', {
      conversationId,
      sender: canonicalFrom,
    });
    return message;
  }

  private async resolveEventStaffByPhone(
    eventId: string,
    canonicalPhone: string,
  ): Promise<{ userId: string; displayName: string | null } | null> {
    const eventUsers = await this.prisma.eventAccessProjection.findMany({
      where: { eventId },
      select: { userId: true },
    });
    if (eventUsers.length === 0) {
      return null;
    }
    return this.prisma.userContactProjection.findFirst({
      where: {
        userId: { in: eventUsers.map(({ userId }) => userId) },
        primaryPhone: canonicalPhone,
      },
      select: { userId: true, displayName: true },
    });
  }

  private async createInternalWhatsAppConversation(
    data: {
      externalId: string;
      tenantId: string;
      eventId: string;
      senderName?: string;
      body?: string;
    },
    canonicalFrom: string,
    staff: { userId: string; displayName: string | null },
  ): Promise<InternalMessage> {
    const participantHash = staff.userId;
    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.internalConversation.upsert({
        where: {
          uq_internal_conversation: {
            tenantId: data.tenantId,
            eventId: data.eventId,
            channel: 'WHATSAPP',
            type: 'DIRECT',
            participantHash,
          },
        },
        create: {
          tenantId: data.tenantId,
          eventId: data.eventId,
          channel: 'WHATSAPP',
          title: staff.displayName ?? data.senderName?.trim() ?? canonicalFrom,
          type: 'DIRECT',
          participantHash,
          createdBy: staff.userId,
        },
        update: { isActive: true, archivedAt: null },
      });
      await tx.internalParticipant.upsert({
        where: {
          uq_internal_participant: { conversationId: conversation.id, userId: staff.userId },
        },
        create: { conversationId: conversation.id, userId: staff.userId },
        update: { leftAt: null },
      });
      await tx.conversationMapping.upsert({
        where: {
          uq_conversation_mapping: {
            tenantId: data.tenantId,
            channel: 'WHATSAPP',
            externalId: canonicalFrom,
            eventId: data.eventId,
          },
        },
        create: {
          tenantId: data.tenantId,
          channel: 'WHATSAPP',
          externalId: canonicalFrom,
          eventId: data.eventId,
          internalConversationId: conversation.id,
          provider: 'EVOLUTION',
        },
        update: {
          conversationId: null,
          internalConversationId: conversation.id,
          provider: 'EVOLUTION',
        },
      });
      const message = await tx.internalMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: staff.userId,
          body: data.body ?? '',
          direction: 'INBOUND',
          channel: 'WHATSAPP',
          provider: 'EVOLUTION',
          externalId: data.externalId,
        },
      });
      await this.enqueueInternalMessageEvent(tx, message, [staff.userId], data.tenantId);
      return { conversation, message };
    });
    return result.message;
  }

  private enqueueSupportMessageEvent(
    tx: Parameters<ConversationOutboxService['enqueue']>[0],
    message: SupportMessage,
    tenantId: string,
    operation: string,
  ): Promise<unknown> {
    const payload = {
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
    } satisfies SupportMessageReceivedDTO;
    if (this.outbox) {
      return this.outbox.enqueue(tx, {
        topic: KafkaTopics.conversation.guestReplied,
        payload,
        tenantId,
        key: message.conversationId,
        operation,
      });
    }
    return this.kafka.send({
      topic: KafkaTopics.conversation.guestReplied,
      payload,
      meta: { type: 'EVENT', service: 'support-message-service', operation, tenantId },
    });
  }

  private enqueueInternalMessageEvent(
    tx: Parameters<ConversationOutboxService['enqueue']>[0],
    message: InternalMessage,
    participantIds: string[],
    tenantId: string,
  ): Promise<unknown> {
    const payload: InternalMessageSentDTO & { channel: InternalConversationChannel } = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      channel: toApiChannel(message.channel),
      body: message.body,
      priority: message.priority,
      createdAt: message.createdAt.toISOString(),
      participantIds,
    };
    if (this.outbox) {
      return this.outbox.enqueue(tx, {
        topic: KafkaTopics.conversation.internalMessage,
        payload,
        tenantId,
        key: message.conversationId,
        operation: 'External Staff Message Received',
      });
    }
    return this.kafka.send({
      topic: KafkaTopics.conversation.internalMessage,
      payload,
      meta: {
        type: 'EVENT',
        service: 'support-message-service',
        operation: 'External Staff Message Received',
        tenantId,
      },
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
