import {
  ConversationAccessDeniedException,
  ConversationNotFoundException,
} from '../../../../modules/notification/errors/notification.error.js';
import type { Prisma, SupportConversation } from '../../../../prisma/generated/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { TenantRouteService } from '../../common/tenant-route.service.js';
import {
  InvitationSupportClientService,
  InvitationSupportValidationException,
} from '../../rsvp/invitation-support-client.service.js';
import { MappingService, normalizeSupportExternalId } from '../mapping/mapping.service.js';
import { Injectable } from '@nestjs/common';
import { ValkeyPubSubService } from '@omnixys/cache-ts';
import { EventPermissionKey } from '@omnixys/contracts-ts';
import { getLogger } from '@omnixys/logger-ts';
import { EventPermissionResolver } from '@omnixys/security-ts';
import type { CurrentUserData } from '@omnixys/security-ts';

@Injectable()
export class ConversationService {
  readonly #logger = getLogger(ConversationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly valkeyPubSub: ValkeyPubSubService,
    private readonly permissionResolver: EventPermissionResolver,
    private readonly mappings: MappingService,
    private readonly invitationClient: InvitationSupportClientService,
    private readonly tenantRoutes: TenantRouteService = new TenantRouteService(),
  ) {}

  async findById(id: string, user: CurrentUserData): Promise<SupportConversation> {
    const tenantId = this.tenantRoutes.requireCurrentTenant();
    const conversation = await this.prisma.supportConversation.findFirst({
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

  async findByEvent(eventId: string, user: CurrentUserData): Promise<SupportConversation[]> {
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    if (!(await this.hasEventPermission(eventId, user, EventPermissionKey.ViewSupport))) {
      throw new ConversationAccessDeniedException(eventId, 'support-view-required');
    }

    return this.prisma.supportConversation.findMany({
      where: { eventId, tenantId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findByUser(userId: string): Promise<SupportConversation[]> {
    const tenantId = this.tenantRoutes.requireCurrentTenant();
    return this.prisma.supportConversation.findMany({
      where: { guestUserId: userId, tenantId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findByInvitation(
    eventId: string,
    invitationId: string,
  ): Promise<SupportConversation | null> {
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    return this.prisma.supportConversation.findFirst({
      where: {
        eventId,
        tenantId,
        invitationId,
        deletedAt: null,
        status: { not: 'CLOSED' },
      },
    });
  }

  async createForAuthenticatedGuest(
    eventId: string,
    user: CurrentUserData,
    data: {
      subject?: string;
      channel: 'WHATSAPP' | 'EMAIL' | 'WEBCHAT' | 'SMS';
      firstMessage: string;
    },
  ): Promise<SupportConversation> {
    const eventAccess = await this.prisma.eventAccessProjection.findUnique({
      where: {
        uq_event_access_projection: {
          eventId,
          userId: user.id,
        },
      },
      select: { id: true },
    });
    if (!eventAccess) {
      await this.#assertGuestSupportAccess(eventId, user.id);
    }

    const guestName =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || user.id;
    return this.create(eventId, {
      guestUserId: user.id,
      guestName,
      guestContact: user.email || undefined,
      subject: data.subject,
      channel: data.channel,
      firstMessage: data.firstMessage,
    });
  }

  /**
   * Creates (or reuses an existing open) support conversation for an RSVP
   * guest whose invitation has already been validated as a capability. The
   * invitation/event pair is authoritative; no guest identity is trusted from
   * the client.
   */
  async createForInvitation(
    eventId: string,
    data: {
      invitationId: string;
      guestName: string;
      guestContact?: string;
      channel: 'WHATSAPP' | 'EMAIL' | 'WEBCHAT' | 'SMS';
      firstMessage: string;
    },
  ): Promise<SupportConversation> {
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    const existing = await this.prisma.supportConversation.findFirst({
      where: {
        eventId,
        tenantId,
        invitationId: data.invitationId,
        status: { not: 'CLOSED' },
      },
    });

    if (existing) {
      this.#logger.debug(
        { eventId, invitationId: data.invitationId, existingId: existing.id },
        'support_conversation_reused_by_invitation',
      );
      return existing;
    }

    const conversation = await this.create(eventId, {
      invitationId: data.invitationId,
      guestName: data.guestName,
      guestContact: data.guestContact,
      channel: data.channel,
      firstMessage: data.firstMessage,
    });

    return conversation;
  }

  async markAsReadByInvitation(
    eventId: string,
    invitationId: string,
  ): Promise<SupportConversation> {
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { eventId, tenantId, invitationId },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(undefined);
    }

    return this.markAsReadInternal(conversation, 'guest');
  }

  async create(
    eventId: string,
    data: {
      invitationId?: string;
      guestUserId?: string;
      guestName: string;
      guestContact?: string;
      subject?: string;
      channel: 'WHATSAPP' | 'EMAIL' | 'WEBCHAT' | 'SMS';
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
      firstMessage: string;
    },
  ): Promise<SupportConversation> {
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    const firstMessage = data.firstMessage.trim();
    if (!firstMessage) {
      throw new Error('A first support message is required');
    }

    const existingByGuestAndEvent = data.guestUserId
      ? await this.prisma.supportConversation.findFirst({
          where: {
            eventId,
            tenantId,
            guestUserId: data.guestUserId,
            status: { not: 'CLOSED' },
          },
        })
      : null;

    if (existingByGuestAndEvent) {
      this.#logger.debug(
        {
          eventId,
          guestUserId: data.guestUserId,
          existingId: existingByGuestAndEvent.id,
        },
        'support_conversation_duplicate_by_guest',
      );
      return existingByGuestAndEvent;
    }

    const existingByInvitation = data.invitationId
      ? await this.prisma.supportConversation.findFirst({
          where: {
            eventId,
            tenantId,
            invitationId: data.invitationId,
            status: { not: 'CLOSED' },
          },
        })
      : null;

    if (existingByInvitation) {
      this.#logger.debug(
        {
          eventId,
          tenantId,
          invitationId: data.invitationId,
          existingId: existingByInvitation.id,
        },
        'support_conversation_duplicate_by_invitation',
      );
      return existingByInvitation;
    }

    let conversation: SupportConversation;
    try {
      conversation = await this.prisma.supportConversation.create({
        data: {
          tenantId,
          eventId,
          invitationId: data.invitationId,
          guestUserId: data.guestUserId,
          guestName: data.guestName,
          guestContact: data.guestContact,
          subject: data.subject,
          channel: data.channel,
          priority: data.priority ?? 'NORMAL',
          status: 'OPEN',
          unreadCount: 1,
          lastMessagePreview: firstMessage.slice(0, 100),
          lastMessageAt: new Date(),
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const winner = await this.prisma.supportConversation.findFirst({
        where: {
          eventId,
          deletedAt: null,
          status: { not: 'CLOSED' },
          ...(data.guestUserId
            ? { guestUserId: data.guestUserId }
            : { invitationId: data.invitationId }),
        },
      });
      if (!winner) {
        throw error;
      }
      return winner;
    }

    this.#logger.debug(
      {
        conversationId: conversation.id,
        eventId,
        channel: data.channel,
        guestName: data.guestName,
      },
      'support_conversation_created',
    );

    await this.prisma.supportMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        channel: data.channel,
        fromUserId: data.guestUserId,
        fromGuest: true,
        body: firstMessage,
        status: 'SENT',
      },
    });

    if (data.channel === 'WHATSAPP' && data.guestContact) {
      await this.mappings.createMapping(
        'WHATSAPP',
        normalizeSupportExternalId(data.guestContact),
        eventId,
        conversation.id,
        tenantId,
      );
    }

    await this.publishConversationChange(eventId, conversation.id, 'created', {
      guestName: data.guestName,
      channel: data.channel,
      unreadCount: 1,
      guestUnreadCount: 0,
    });

    return conversation;
  }

  async update(
    id: string,
    data: {
      subject?: string;
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    },
    user: CurrentUserData,
  ): Promise<SupportConversation> {
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(id);
    }

    if (
      !(await this.hasEventPermission(conversation.eventId, user, EventPermissionKey.ManageSupport))
    ) {
      throw new ConversationAccessDeniedException(id, 'support-manage-required');
    }

    const updateData: Prisma.SupportConversationUpdateInput = {};

    if (data.subject !== undefined) {
      updateData.subject = data.subject;
    }

    if (data.priority !== undefined) {
      updateData.priority = data.priority;
    }

    const updated = await this.prisma.supportConversation.update({
      where: { id },
      data: updateData,
    });

    await this.publishConversationChange(conversation.eventId, id, 'updated', {
      subject: updated.subject,
      priority: updated.priority,
    });

    return updated;
  }

  async countByEvent(
    eventId: string,
    user: CurrentUserData,
    status?: 'OPEN' | 'ASSIGNED' | 'CLOSED',
  ): Promise<number> {
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    if (!(await this.hasEventPermission(eventId, user, EventPermissionKey.ViewSupport))) {
      throw new ConversationAccessDeniedException(eventId, 'support-view-required');
    }

    const where: Prisma.SupportConversationWhereInput = { eventId, tenantId };

    if (status) {
      where.status = status;
    }

    return this.prisma.supportConversation.count({ where });
  }

  async getUnreadCountsByEvent(
    eventId: string,
    user: CurrentUserData,
  ): Promise<SupportConversation[]> {
    const tenantId = this.tenantRoutes.requireEventTenant(eventId);
    if (!(await this.hasEventPermission(eventId, user, EventPermissionKey.ViewSupport))) {
      throw new ConversationAccessDeniedException(eventId, 'support-view-required');
    }

    return this.prisma.supportConversation.findMany({
      where: { eventId, tenantId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        eventId: true,
        invitationId: true,
        guestUserId: true,
        guestName: true,
        guestContact: true,
        subject: true,
        channel: true,
        status: true,
        priority: true,
        assignedTo: true,
        assignedToUser: true,
        unreadCount: true,
        guestUnreadCount: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
        emailMessageId: true,
        emailInReplyTo: true,
        emailReferences: true,
        tags: true,
        metadata: true,
        slaDeadline: true,
        escalatedAt: true,
        escalatedTo: true,
        internalNote: true,
        deletedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async markAsRead(conversationId: string, user: CurrentUserData): Promise<SupportConversation> {
    const tenantId = this.tenantRoutes.requireCurrentTenant();
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { id: conversationId, tenantId },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(conversationId);
    }

    if (!(await this.canAccessConversation(conversation, user))) {
      throw new ConversationAccessDeniedException(conversationId);
    }

    const audience = conversation.guestUserId === user.id ? 'guest' : 'staff';
    return this.markAsReadInternal(conversation, audience);
  }

  private async markAsReadInternal(
    conversation: { id: string; eventId: string },
    audience: 'guest' | 'staff',
  ): Promise<SupportConversation> {
    const updated = await this.prisma.supportConversation.update({
      where: { id: conversation.id },
      data: audience === 'guest' ? { guestUnreadCount: 0 } : { unreadCount: 0 },
    });

    await this.publishConversationChange(conversation.eventId, conversation.id, 'unread', {
      audience,
      unreadCount: updated.unreadCount,
      guestUnreadCount: updated.guestUnreadCount,
    });

    return updated;
  }

  /**
   * Publishes a support-conversation change to the per-conversation and
   * per-event Valkey channels so realtime clients (staff event inbox, guests)
   * can refresh lists/unread badges. Non-critical: publishes are best effort.
   */
  private async publishConversationChange(
    eventId: string,
    conversationId: string,
    kind: 'created' | 'updated' | 'status' | 'unread',
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const payload = { eventId, conversationId, kind, ...extra };
    try {
      await this.valkeyPubSub.publish(`support.event.conversations.${eventId}`, payload);
      await this.valkeyPubSub.publish(`support.conversation.updated.${conversationId}`, payload);
    } catch {
      // Valkey publish failure is non-critical
    }
  }

  /**
   * Synchronous capability check for authenticated guests when the
   * asynchronously-populated event-access projection is not yet available.
   * The invitation service is the source of truth for guest support access.
   * A resolved rejection fails closed with the public access-denied error;
   * unexpected failures still propagate so outages stay observable.
   */
  async #assertGuestSupportAccess(eventId: string, userId: string): Promise<void> {
    try {
      await this.invitationClient.resolveByUser(eventId, userId);
    } catch (error) {
      if (!(error instanceof InvitationSupportValidationException)) {
        throw error;
      }
      this.#logger.warn(
        { eventId, userId, reason: error.code },
        'support_conversation_sync_access_denied',
      );
      throw new ConversationAccessDeniedException(eventId, 'event-membership-required');
    }
  }

  private async canAccessConversation(
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

  async canUserViewEventSupport(
    eventId: string,
    userId: string,
    tenantId?: string,
  ): Promise<boolean> {
    if (!tenantId || this.tenantRoutes.requireEventTenant(eventId) !== tenantId) {
      return false;
    }
    const permissions = await this.permissionResolver.getPermissionsForUser(userId, eventId);
    return permissions.includes(EventPermissionKey.ViewSupport);
  }

  async canUserAccessSubscription(
    conversationId: string,
    userId: string,
    tenantId?: string,
  ): Promise<{ allowed: boolean; eventId?: string }> {
    if (!tenantId) {
      return { allowed: false };
    }
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { eventId: true, guestUserId: true },
    });
    if (!conversation) {
      return { allowed: false };
    }
    if (conversation.guestUserId === userId) {
      return { allowed: true, eventId: conversation.eventId };
    }
    return {
      allowed: await this.canUserViewEventSupport(conversation.eventId, userId, tenantId),
      eventId: conversation.eventId,
    };
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
