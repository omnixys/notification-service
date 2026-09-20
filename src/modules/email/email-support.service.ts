import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConversationOutboxService } from '../support/modules/outbox/conversation-outbox.service.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  EmailOutboundDTO,
  EmailReceivedDTO,
  InternalMessageSentDTO,
  SupportMessageReceivedDTO,
} from '@omnixys/contracts-ts';
import { KafkaProducerService, KafkaTopics } from '@omnixys/kafka-ts';
import { getLogger } from '@omnixys/logger-ts';

@Injectable()
export class EmailSupportService {
  readonly #logger = getLogger(EmailSupportService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
    @Optional()
    @Inject(ConversationOutboxService)
    private readonly outbox?: ConversationOutboxService,
  ) {}

  async handleInbound(payload: EmailReceivedDTO): Promise<void> {
    const messageId = payload.messageId;
    const inReplyTo = payload.inReplyTo;
    const references = payload.references;
    const fromEmail = this.extractEmail(payload.from);
    const subject = payload.subject ?? '(no subject)';

    if (!fromEmail) {
      return;
    }

    if (messageId) {
      const duplicate = await this.prisma.supportMessage.findFirst({
        where: { provider: 'EMAIL', externalId: messageId },
        select: { id: true },
      });
      const internalDuplicate = await this.prisma.internalMessage.findFirst({
        where: { provider: 'EMAIL', externalId: messageId },
        select: { id: true },
      });
      if (duplicate || internalDuplicate) {
        return;
      }
    }

    const route = await this.resolveEventContext(payload);
    if (!route) {
      this.#logger.warn({ fromEmail, messageId }, 'email_no_event_context');
      return;
    }
    const { eventId, tenantId } = route;

    const matched = await this.matchConversation(
      eventId,
      tenantId,
      messageId,
      inReplyTo,
      references,
      fromEmail,
    );

    if (matched) {
      this.#logger.debug({ conversationId: matched, fromEmail, messageId }, 'email_thread_matched');
      await this.addMessageToConversation(matched, payload, 'INBOUND', tenantId);
      return;
    }

    const staff = await this.resolveEventStaffByEmail(eventId, fromEmail);
    if (staff) {
      await this.addInternalEmailMessage(eventId, tenantId, staff, payload);
      return;
    }

    this.#logger.debug({ fromEmail, messageId, subject }, 'email_no_thread_match');
    const conversationId = await this.findOrCreateConversation(
      eventId,
      tenantId,
      fromEmail,
      subject,
      payload,
    );

    await this.addMessageToConversation(conversationId, payload, 'INBOUND', tenantId);
  }

  private async matchConversation(
    eventId: string,
    tenantId: string,
    messageId: string | undefined,
    inReplyTo: string | undefined,
    references: string | undefined,
    fromEmail: string,
  ): Promise<string | null> {
    // Strategy 1: Match by Message-ID header (used in In-Reply-To / References)
    const allRefs = [
      messageId,
      inReplyTo,
      ...(references?.split(/\s+/).filter(Boolean) ?? []),
    ].filter(Boolean) as string[];

    if (allRefs.length > 0) {
      const byMessageThread = await this.prisma.supportMessage.findFirst({
        where: {
          conversation: { eventId, tenantId },
          OR: [
            { emailMessageId: { in: allRefs } },
            { emailInReplyTo: { in: allRefs } },
            { emailReferences: { contains: allRefs[0] } },
          ],
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { conversationId: true },
      });

      if (byMessageThread) {
        return byMessageThread.conversationId;
      }
    }

    // Strategy 2: Match by sender with open conversation
    const bySender = await this.prisma.supportConversation.findFirst({
      where: {
        eventId,
        tenantId,
        guestContact: fromEmail,
        status: { notIn: ['CLOSED', 'RESOLVED'] },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (bySender) {
      return bySender.id;
    }

    return null;
  }

  private async resolveEventContext(
    payload: EmailReceivedDTO,
  ): Promise<{ eventId: string; tenantId: string } | undefined> {
    // Priority 1: Event-specific mailbox address
    const toAddresses = [...(payload.to ?? []), ...(payload.cc ?? [])].filter(Boolean);

    for (const addr of toAddresses) {
      const email = this.extractEmail(addr ?? '');
      if (!email) {
        continue;
      }

      // Match event-specific addresses like "wedding@omnixys.com" → event slug/ID
      const mappings = await this.prisma.conversationMapping.findMany({
        where: {
          channel: 'EMAIL',
          externalId: email,
          eventId: { not: null },
        },
        select: { eventId: true, tenantId: true },
      });

      const routes = mappings.filter((mapping): mapping is { eventId: string; tenantId: string } =>
        Boolean(
          mapping.eventId &&
          mapping.tenantId &&
          env.EVENT_TENANT_MAP[mapping.eventId] === mapping.tenantId,
        ),
      );
      if (routes.length === 1 && routes[0]) {
        return routes[0];
      }

      // Only mappings for configured event mailboxes may establish an inbound context.
      // A sender or arbitrary recipient address must never select an event globally.
    }

    // Priority 3: Fallback — no event context
    return undefined;
  }

  private async findOrCreateConversation(
    eventId: string | undefined,
    tenantId: string,
    fromEmail: string,
    subject: string,
    payload: EmailReceivedDTO,
  ): Promise<string> {
    // Only create if we have an event context
    if (!eventId) {
      // No event — store in a fallback conversation or log
      // For now, skip creating a conversation
      this.#logger.warn({ fromEmail, subject }, 'email_no_event_context');
      throw new Error(`No event context for email from ${fromEmail}`);
    }

    // Check for existing open conversation for this guest+event
    const existing = await this.prisma.supportConversation.findFirst({
      where: {
        eventId,
        tenantId,
        guestContact: fromEmail,
        status: { notIn: ['CLOSED', 'RESOLVED'] },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      return existing.id;
    }

    // Create new conversation
    const conversation = await this.prisma.supportConversation.create({
      data: {
        tenantId,
        eventId,
        guestName: payload.from ? this.extractName(payload.from) : fromEmail,
        guestContact: fromEmail,
        subject: subject.slice(0, 255),
        channel: 'EMAIL',
        status: 'OPEN',
        priority: 'NORMAL',
        emailMessageId: payload.messageId,
        emailInReplyTo: payload.inReplyTo,
        emailReferences: payload.references?.slice(0, 1024),
        lastMessagePreview: subject.slice(0, 100),
        lastMessageAt: new Date(),
      },
    });

    // Create mapping for this email address
    await this.prisma.conversationMapping.create({
      data: {
        tenantId,
        channel: 'EMAIL',
        externalId: fromEmail,
        eventId,
        conversationId: conversation.id,
        mappingType: 'AUTO',
        provider: 'EMAIL',
      },
    });

    // Create mapping for the source email if different
    const allTo = [...(payload.to ?? []), ...(payload.cc ?? [])].filter(Boolean);
    for (const toAddr of allTo) {
      const toEmail = this.extractEmail(toAddr);
      if (toEmail && toEmail !== fromEmail && eventId) {
        await this.prisma.conversationMapping.upsert({
          where: {
            uq_conversation_mapping: {
              tenantId,
              channel: 'EMAIL',
              externalId: toEmail,
              eventId,
            },
          },
          create: {
            tenantId,
            channel: 'EMAIL',
            externalId: toEmail,
            eventId,
            conversationId: conversation.id,
            mappingType: 'AUTO',
            provider: 'EMAIL',
          },
          update: {
            conversationId: conversation.id,
            internalConversationId: null,
            provider: 'EMAIL',
          },
        });
      }
    }

    return conversation.id;
  }

  private async addMessageToConversation(
    conversationId: string,
    payload: EmailReceivedDTO,
    direction: 'INBOUND' | 'OUTBOUND',
    tenantId: string,
  ): Promise<void> {
    const body = payload.body ?? payload.htmlBody ?? '(no content)';

    await this.prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({
        data: {
          conversationId,
          direction,
          channel: 'EMAIL',
          fromGuest: direction === 'INBOUND',
          body,
          status: 'SENT',
          externalId: payload.messageId,
          provider: 'EMAIL',
          emailMessageId: payload.messageId,
          emailInReplyTo: payload.inReplyTo,
          emailReferences: payload.references?.slice(0, 1024),
        },
      });

      await tx.supportConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: body.slice(0, 100),
          emailMessageId: payload.messageId ?? undefined,
          emailInReplyTo: payload.inReplyTo ?? undefined,
          emailReferences: payload.references?.slice(0, 1024) ?? undefined,
        },
      });

      const eventPayload = {
        id: message.id,
        conversationId: message.conversationId,
        direction: message.direction,
        channel: message.channel,
        fromGuest: message.fromGuest,
        body: message.body ?? undefined,
        status: message.status,
        createdAt: message.createdAt.toISOString(),
      } satisfies SupportMessageReceivedDTO;
      if (this.outbox) {
        await this.outbox.enqueue(tx, {
          topic: KafkaTopics.conversation.guestReplied,
          payload: eventPayload,
          tenantId,
          key: conversationId,
          operation: 'Email Inbound Processed',
        });
      } else {
        await this.kafka.send({
          topic: KafkaTopics.conversation.guestReplied,
          payload: eventPayload,
          meta: {
            type: 'EVENT',
            service: 'email-support-service',
            operation: 'Email Inbound Processed',
            tenantId,
          },
        });
      }
    });
  }

  async handleOutbound(
    conversationId: string,
    body: string,
    user: { id: string },
  ): Promise<{ messageId: string; to: string } | null> {
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation?.guestContact) {
      return null;
    }
    const recipient = conversation.guestContact;

    const tenantId = conversation.tenantId ?? env.EVENT_TENANT_MAP[conversation.eventId];
    if (!tenantId) {
      return null;
    }
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          conversationId,
          direction: 'OUTBOUND',
          channel: 'EMAIL',
          fromUserId: user.id,
          fromGuest: false,
          body,
          status: 'SENT',
        },
      });
      const payload = {
        to: recipient,
        subject: conversation.subject ? `Re: ${conversation.subject}` : 'Support Reply',
        body,
        inReplyTo: conversation.emailMessageId ?? undefined,
        references: [conversation.emailReferences ?? conversation.emailMessageId]
          .filter(Boolean)
          .join(' '),
        conversationId,
        messageId: created.id,
      } satisfies EmailOutboundDTO;
      if (this.outbox) {
        await this.outbox.enqueue(tx, {
          topic: KafkaTopics.email.outboundSend,
          payload,
          tenantId,
          key: conversationId,
          actorId: user.id,
          type: 'COMMAND',
          operation: 'Email Outbound Requested',
        });
      } else {
        await this.kafka.send({
          topic: KafkaTopics.email.outboundSend,
          payload,
          meta: {
            type: 'COMMAND',
            service: 'email-support-service',
            operation: 'Email Outbound Requested',
            actorId: user.id,
            tenantId,
          },
        });
      }
      return created;
    });

    return {
      messageId: message.id,
      to: recipient,
    };
  }

  private async resolveEventStaffByEmail(
    eventId: string,
    email: string,
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
        email,
      },
      select: { userId: true, displayName: true },
    });
  }

  private async addInternalEmailMessage(
    eventId: string,
    tenantId: string,
    staff: { userId: string; displayName: string | null },
    payload: EmailReceivedDTO,
  ): Promise<void> {
    const body = payload.body ?? payload.htmlBody ?? '(no content)';
    const participantHash = staff.userId;
    await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.internalConversation.upsert({
        where: {
          uq_internal_conversation: {
            tenantId,
            eventId,
            channel: 'EMAIL',
            type: 'DIRECT',
            participantHash,
          },
        },
        create: {
          tenantId,
          eventId,
          channel: 'EMAIL',
          title: staff.displayName || this.extractName(payload.from),
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
      const message = await tx.internalMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: staff.userId,
          body,
          direction: 'INBOUND',
          channel: 'EMAIL',
          provider: 'EMAIL',
          externalId: payload.messageId,
          emailMessageId: payload.messageId,
          emailInReplyTo: payload.inReplyTo,
          emailReferences: payload.references?.slice(0, 1024),
        },
      });
      const eventPayload = {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        body: message.body,
        priority: message.priority,
        createdAt: message.createdAt.toISOString(),
        participantIds: [staff.userId],
      } satisfies InternalMessageSentDTO;
      if (this.outbox) {
        await this.outbox.enqueue(tx, {
          topic: KafkaTopics.conversation.internalMessage,
          payload: eventPayload,
          tenantId,
          key: conversation.id,
          operation: 'Email Staff Message Processed',
        });
      } else {
        await this.kafka.send({
          topic: KafkaTopics.conversation.internalMessage,
          payload: eventPayload,
          meta: {
            type: 'EVENT',
            service: 'email-support-service',
            operation: 'Email Staff Message Processed',
            tenantId,
          },
        });
      }
      return message;
    });
  }

  private extractEmail(input: string): string | undefined {
    if (!input) {
      return undefined;
    }
    const match = input.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return match?.[0].toLowerCase();
  }

  private extractName(input: string): string {
    if (!input) {
      return 'Unknown';
    }
    const match = input.match(/^"?([^"<]+)"?\s*</);
    return match?.[1]?.trim() ?? this.extractEmail(input) ?? 'Unknown';
  }
}
