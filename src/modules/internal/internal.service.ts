import type {
  InternalConversation,
  InternalMessage,
  InternalParticipant,
  Prisma,
} from '../../prisma/generated/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toApiChannel, InternalConversationChannel } from '../internal/entities/internal-conversation.entity.js';
import {
  ConversationAccessDeniedException,
  ConversationNotFoundException,
} from '../notification/errors/notification.error.js';
import { TenantRouteService } from '../support/common/tenant-route.service.js';
import { ConversationOutboxService } from '../support/modules/outbox/conversation-outbox.service.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventPermissionKey } from '@omnixys/contracts-ts';
import type {
  InternalConversationCreatedDTO,
  InternalMessageSentDTO,
  InternalReadReceiptDTO,
} from '@omnixys/contracts-ts';
import { KafkaProducerService, KafkaTopics } from '@omnixys/kafka-ts';
import { getLogger } from '@omnixys/logger-ts';
import { EventPermissionResolver } from '@omnixys/security-ts';
import type { CurrentUserData } from '@omnixys/security-ts';

@Injectable()
export class InternalService {
  readonly #logger = getLogger(InternalService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
    private readonly permissionResolver: EventPermissionResolver,
    private readonly tenantRoutes: TenantRouteService = new TenantRouteService(),
    @Optional()
    @Inject(ConversationOutboxService)
    private readonly outbox?: ConversationOutboxService,
  ) {}

  async findConversations(eventId: string, user: CurrentUserData): Promise<InternalConversation[]> {
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    await this.requireSupportView(eventId, user);

    const conversations = await this.prisma.internalConversation.findMany({
      where: {
        eventId,
        tenantId,
        isActive: true,
        OR: [
          { type: 'BROADCAST' },
          { type: 'ROLE_CHANNEL' },
          {
            type: 'DIRECT',
            participants: { some: { userId: user.id, leftAt: null } },
          },
        ],
      },
      include: { participants: { where: { leftAt: null } } },
      orderBy: { updatedAt: 'desc' },
    });

    const unreadCounts = await this.countUnreadMessages(conversations, user.id);
    return conversations.map((conversation) => ({
      ...conversation,
      unreadCount: unreadCounts.get(conversation.id) ?? 0,
    }));
  }

  private async countUnreadMessages(
    conversations: Prisma.InternalConversationGetPayload<{
      include: { participants: true };
    }>[],
    userId: string,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    await Promise.all(
      conversations.map(async (conversation) => {
        const participant = conversation.participants?.find((p) => p.userId === userId);
        if (!participant) {
          counts.set(conversation.id, 0);
          return;
        }
        const lastReadAt = participant.lastReadAt;
        const count = await this.prisma.internalMessage.count({
          where: {
            conversationId: conversation.id,
            ...(lastReadAt
              ? { createdAt: { gt: lastReadAt } }
              : { createdAt: { gt: new Date(0) }, senderId: { not: userId } }),
          },
        });
        counts.set(conversation.id, count);
      }),
    );
    return counts;
  }

  async findConversationById(id: string, user: CurrentUserData): Promise<InternalConversation> {
    const tenantId = this.tenantRoutes.requireCurrentTenant();
    const conversation = await this.prisma.internalConversation.findFirst({
      where: { id, tenantId },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(id);
    }

    if (!(await this.canAccessConversation(conversation, user))) {
      throw new ConversationAccessDeniedException(id);
    }

    return conversation;
  }

  async findMessages(
    conversationId: string,
    user: CurrentUserData,
    limit = 100,
  ): Promise<InternalMessage[]> {
    await this.findConversationById(conversationId, user);

    if (!(await this.isParticipant(conversationId, user.id))) {
      throw new ConversationAccessDeniedException(conversationId);
    }

    return this.prisma.internalMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async createConversation(
    eventId: string,
    data: {
      title: string;
      description?: string;
      type: 'BROADCAST' | 'DIRECT' | 'ROLE_CHANNEL';
      roleId?: string;
      participantIds?: string[];
    },
    user: CurrentUserData,
  ): Promise<InternalConversation> {
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    // BROADCAST / ROLE_CHANNEL require ManageSupport.
    if (data.type === 'DIRECT') {
      await this.requireSupportView(eventId, user);
    } else {
      await this.requireSupportManage(eventId, user);
    }

    // Avoid duplicate DIRECT conversations between the same participants.
    // Uses deterministic participantHash for exact matching and race-condition safety.
    if (data.type === 'DIRECT' && data.participantIds?.length === 1) {
      const targetUserId = data.participantIds[0];
      const allParticipantIds: string[] = [user.id, ...(targetUserId ? [targetUserId] : [])];
      const participantHash = [...allParticipantIds].sort().join('|');

      // Fast path: hash-based lookup (unique constraint prevents duplicates)
      const byHash = await this.prisma.internalConversation.findFirst({
        where: {
          tenantId,
          eventId,
          channel: 'WEBCHAT',
          type: 'DIRECT',
          isActive: true,
          participantHash,
        },
      });
      if (byHash) {
        return byHash;
      }

      // Fallback for legacy conversations without participantHash
      const existing = await this.prisma.internalConversation.findFirst({
        where: {
          eventId,
          tenantId,
          channel: 'WEBCHAT',
          type: 'DIRECT',
          isActive: true,
          participants: {
            every: { userId: { in: allParticipantIds } },
          },
        },
      });

      if (existing) {
        const participants = await this.prisma.internalParticipant.findMany({
          where: { conversationId: existing.id, leftAt: null },
        });
        const existingIds = participants.map((p) => p.userId);
        const isExactMatch =
          existingIds.length === allParticipantIds.length &&
          allParticipantIds.every((id) => existingIds.includes(id)) &&
          existingIds.every((id) => allParticipantIds.includes(id));
        if (isExactMatch) {
          return existing;
        }
      }
    }

    const participantIds = new Set([user.id, ...(data.participantIds ?? [])]);
    const participantHash =
      data.type === 'DIRECT' && participantIds.size > 0
        ? [...participantIds].sort().join('|')
        : undefined;

    let conversation: InternalConversation;
    try {
      conversation = await this.prisma.$transaction(async (tx) => {
        const created = await tx.internalConversation.create({
          data: {
            tenantId,
            eventId,
            channel: 'WEBCHAT',
            title: data.title,
            description: data.description,
            type: data.type,
            roleId: data.roleId,
            participantHash,
            createdBy: user.id,
            isActive: true,
          },
        });
        await tx.internalParticipant.createMany({
          data: Array.from(participantIds).map((userId) => ({
            conversationId: created.id,
            userId,
          })),
          skipDuplicates: true,
        });
        return created;
      });
    } catch (error) {
      if (data.type !== 'DIRECT' || !participantHash || !isUniqueConstraintError(error)) {
        throw error;
      }
      const winner = await this.prisma.internalConversation.findUnique({
        where: {
          uq_internal_conversation: {
            tenantId,
            eventId,
            channel: 'WEBCHAT',
            type: 'DIRECT',
            participantHash,
          },
        },
      });
      if (!winner) {
        throw error;
      }
      return winner;
    }

    await this.kafka.send({
      topic: KafkaTopics.conversation.internalCreated,
      payload: {
        conversationId: conversation.id,
        eventId: conversation.eventId,
        title: conversation.title,
        type: conversation.type,
        createdBy: conversation.createdBy,
      } satisfies InternalConversationCreatedDTO,
      meta: {
        clazz: this.constructor.name,
        type: 'EVENT',
        service: 'internal-service',
        operation: 'Internal Conversation Created',
        version: '1',
        actorId: user.id,
        tenantId,
      },
    });

    this.#logger.debug(
      {
        conversationId: conversation.id,
        eventId,
        type: data.type,
        createdBy: user.id,
      },
      'internal_conversation_created',
    );

    return conversation;
  }

  async sendMessage(
    conversationId: string,
    data: { body: string; priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' },
    user: CurrentUserData,
  ): Promise<InternalMessage> {
    const conversation = await this.findConversationById(conversationId, user);

    if (!(await this.isParticipant(conversationId, user.id))) {
      throw new ConversationAccessDeniedException(conversationId);
    }

    const participants = await this.prisma.internalParticipant.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.internalMessage.create({
        data: {
          conversationId,
          senderId: user.id,
          channel: conversation.channel,
          body: data.body,
          priority: data.priority ?? 'NORMAL',
        },
      });
      await tx.internalConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      const payload: InternalMessageSentDTO & { channel: InternalConversationChannel } = {
        id: created.id,
        conversationId: created.conversationId,
        senderId: created.senderId,
        channel: toApiChannel(conversation.channel),
        body: created.body,
        priority: created.priority,
        createdAt: created.createdAt.toISOString(),
        participantIds: participants.map((participant) => participant.userId),
      };
      const tenantId =
        conversation.tenantId ?? this.tenantRoutes.requireEventTenant(conversation.eventId);
      if (this.outbox) {
        await this.outbox.enqueue(tx, {
          topic: KafkaTopics.conversation.internalMessage,
          payload,
          tenantId,
          key: conversationId,
          actorId: user.id,
          operation: 'Internal Message Sent',
        });
      } else {
        await this.kafka.send({
          topic: KafkaTopics.conversation.internalMessage,
          payload,
          meta: {
            type: 'EVENT',
            service: 'internal-service',
            operation: 'Internal Message Sent',
            actorId: user.id,
            tenantId,
          },
        });
      }
      return created;
    });

    this.#logger.debug(
      {
        conversationId,
        senderId: user.id,
        priority: data.priority,
      },
      'internal_message_sent',
    );

    return message;
  }

  async markAsRead(conversationId: string, user: CurrentUserData): Promise<InternalParticipant> {
    const conversation = await this.findConversationById(conversationId, user);

    const participant = await this.prisma.internalParticipant.findUnique({
      where: {
        uq_internal_participant: {
          conversationId,
          userId: user.id,
        },
      },
    });

    if (!participant) {
      throw new ConversationAccessDeniedException(conversationId);
    }

    const updated = await this.prisma.internalParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

    await this.kafka.send({
      topic: KafkaTopics.conversation.internalRead,
      payload: {
        conversationId,
        userId: user.id,
        lastReadAt: updated.lastReadAt?.toISOString() ?? '',
      } satisfies InternalReadReceiptDTO,
      meta: {
        clazz: this.constructor.name,
        type: 'EVENT',
        service: 'internal-service',
        operation: 'Internal Read Receipt',
        version: '1',
        actorId: user.id,
        tenantId:
          conversation.tenantId ?? this.tenantRoutes.requireEventTenant(conversation.eventId),
      },
    });

    return updated;
  }

  async archiveConversation(id: string, user: CurrentUserData): Promise<InternalConversation> {
    const conversation = await this.findConversationById(id, user);

    await this.requireSupportManage(conversation.eventId, user);

    return this.prisma.internalConversation.update({
      where: { id },
      data: {
        isActive: false,
        archivedAt: new Date(),
      },
    });
  }

  async addParticipants(
    conversationId: string,
    userIds: string[],
    user: CurrentUserData,
  ): Promise<void> {
    const conversation = await this.findConversationById(conversationId, user);
    await this.requireSupportManage(conversation.eventId, user);

    await this.prisma.internalParticipant.createMany({
      data: userIds.map((userId) => ({
        conversationId,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  private async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const participant = await this.prisma.internalParticipant.findUnique({
      where: {
        uq_internal_participant: {
          conversationId,
          userId,
        },
      },
    });
    return !!participant && !participant.leftAt;
  }

  private async canAccessConversation(
    conversation: { id: string; eventId: string; type: string; createdBy: string },
    user: CurrentUserData,
  ): Promise<boolean> {
    if (conversation.type === 'BROADCAST' || conversation.type === 'ROLE_CHANNEL') {
      return this.hasEventPermission(conversation.eventId, user, EventPermissionKey.ViewSupport);
    }

    if (conversation.createdBy === user.id) {
      return true;
    }

    return this.isParticipant(conversation.id, user.id);
  }

  private async requireSupportView(eventId: string, user: CurrentUserData): Promise<void> {
    const has = await this.hasEventPermission(eventId, user, EventPermissionKey.ViewSupport);
    if (!has) {
      throw new ConversationAccessDeniedException(eventId, 'support-view-required');
    }
  }

  private async requireSupportManage(eventId: string, user: CurrentUserData): Promise<void> {
    const has = await this.hasEventPermission(eventId, user, EventPermissionKey.ManageSupport);
    if (!has) {
      throw new ConversationAccessDeniedException(eventId, 'support-manage-required');
    }
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
