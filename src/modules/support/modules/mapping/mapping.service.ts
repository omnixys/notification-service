import type {
  ConversationChannel,
  ConversationMapping,
} from '../../../../prisma/generated/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { Injectable } from '@nestjs/common';
import { getLogger } from '@omnixys/logger-ts';

export interface MappingResult {
  conversationId: string | null;
  internalConversationId?: string;
  eventId: string | null;
  created: boolean;
}

export function normalizeSupportExternalId(value: string): string {
  const normalized = value.trim().replace(/@(?:c|s)\.whatsapp\.net$/i, '');
  const digits = normalized.replace(/\D/g, '');
  return digits ? `+${digits}` : normalized;
}

@Injectable()
export class MappingService {
  readonly #logger = getLogger(MappingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveMapping(
    channel: ConversationChannel,
    externalId: string,
    eventId?: string,
    tenantId?: string,
  ): Promise<MappingResult> {
    if (!eventId || !tenantId) {
      this.#logger.warn({ channel, externalId }, 'mapping_missing_tenant_or_event_context');
      return { conversationId: null, eventId: null, created: false };
    }

    const mapping = await this.prisma.conversationMapping.findUnique({
      where: {
        uq_conversation_mapping: {
          tenantId,
          channel,
          externalId,
          eventId,
        },
      },
    });
    if (mapping?.conversationId) {
      const conv = await this.prisma.supportConversation.findUnique({
        where: { id: mapping.conversationId },
      });
      if (conv && !conv.deletedAt && conv.eventId === eventId && conv.tenantId === tenantId) {
        this.#logger.debug(
          {
            channel,
            externalId,
            eventId,
            conversationId: conv.id,
          },
          'mapping_resolved_by_event',
        );
        return {
          conversationId: conv.id,
          eventId: conv.eventId,
          created: false,
        };
      }
    }

    if (mapping?.internalConversationId) {
      const conversation = await this.prisma.internalConversation.findFirst({
        where: { id: mapping.internalConversationId, eventId, tenantId, isActive: true },
      });
      if (conversation) {
        return {
          conversationId: null,
          internalConversationId: conversation.id,
          eventId,
          created: false,
        };
      }
    }

    this.#logger.debug({ channel, externalId, eventId }, 'mapping_not_found');
    return { conversationId: null, eventId: null, created: false };
  }

  async createMapping(
    channel: ConversationChannel,
    externalId: string,
    eventId: string,
    conversationId: string,
    tenantId: string,
    mappingType: 'AUTO' | 'MANUAL' | 'FALLBACK' = 'AUTO',
    provider = 'LEGACY',
  ): Promise<void> {
    await this.prisma.conversationMapping.upsert({
      where: {
        uq_conversation_mapping: {
          tenantId,
          channel,
          externalId,
          eventId,
        },
      },
      create: {
        tenantId,
        channel,
        externalId,
        eventId,
        conversationId,
        provider,
        mappingType,
      },
      update: {
        conversationId,
        internalConversationId: null,
        provider,
        mappingType,
      },
    });
  }

  async createInternalMapping(
    channel: ConversationChannel,
    externalId: string,
    eventId: string,
    internalConversationId: string,
    tenantId: string,
    provider: string,
  ): Promise<void> {
    await this.prisma.conversationMapping.upsert({
      where: {
        uq_conversation_mapping: { tenantId, channel, externalId, eventId },
      },
      create: {
        tenantId,
        channel,
        externalId,
        eventId,
        internalConversationId,
        provider,
        mappingType: 'AUTO',
      },
      update: {
        conversationId: null,
        internalConversationId,
        provider,
        mappingType: 'AUTO',
      },
    });
  }

  async resolveUniqueInboundMapping(
    channel: ConversationChannel,
    externalId: string,
    eventId?: string,
    tenantId?: string,
  ): Promise<MappingResult> {
    const canonicalExternalId = normalizeSupportExternalId(externalId);
    if (!eventId || !tenantId) {
      this.#logger.warn(
        { channel, externalId: canonicalExternalId },
        'inbound_mapping_missing_tenant_or_event_context',
      );
      return { conversationId: null, eventId: null, created: false };
    }
    const mappings = await this.prisma.conversationMapping.findMany({
      where: { channel, externalId: canonicalExternalId, eventId, tenantId },
      include: { conversation: true, internalConversation: true },
    });
    const mapped = mappings.filter(({ conversation, internalConversation }) =>
      Boolean(
        (conversation && !conversation.deletedAt && conversation.status !== 'CLOSED') ||
        (internalConversation && internalConversation.isActive),
      ),
    );
    if (mapped.length === 1 && mapped[0]?.eventId) {
      return {
        conversationId: mapped[0].conversationId ?? null,
        ...(mapped[0].internalConversationId
          ? { internalConversationId: mapped[0].internalConversationId }
          : {}),
        eventId: mapped[0].eventId,
        created: false,
      };
    }
    if (mapped.length > 1) {
      this.#logger.warn(
        { channel, externalId: canonicalExternalId, matchCount: mapped.length },
        'inbound_mapping_ambiguous',
      );
      return { conversationId: null, eventId: null, created: false };
    }

    const candidates = await this.prisma.supportConversation.findMany({
      where: {
        channel,
        eventId,
        tenantId,
        deletedAt: null,
        status: { not: 'CLOSED' },
        guestContact: { not: null },
      },
    });
    const matching = candidates.filter(
      ({ guestContact }) =>
        guestContact && normalizeSupportExternalId(guestContact) === canonicalExternalId,
    );
    if (matching.length !== 1 || !matching[0]) {
      this.#logger.warn(
        { channel, externalId: canonicalExternalId, matchCount: matching.length },
        matching.length > 1 ? 'inbound_mapping_ambiguous' : 'inbound_mapping_not_found',
      );
      return { conversationId: null, eventId: null, created: false };
    }

    const conversation = matching[0];
    await this.createMapping(
      channel,
      canonicalExternalId,
      conversation.eventId,
      conversation.id,
      tenantId,
      'AUTO',
    );
    return {
      conversationId: conversation.id,
      eventId: conversation.eventId,
      created: true,
    };
  }

  async findByConversation(conversationId: string): Promise<ConversationMapping[]> {
    return this.prisma.conversationMapping.findMany({
      where: { conversationId },
    });
  }
}
