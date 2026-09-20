import type {
  ConversationChannel,
  ConversationMapping,
} from '../../../../prisma/generated/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { Injectable } from '@nestjs/common';
import { getLogger } from '@omnixys/logger-ts';

export interface MappingResult {
  conversationId: string | null;
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
  ): Promise<MappingResult> {
    if (eventId) {
      const mapping = await this.prisma.conversationMapping.findUnique({
        where: {
          uq_conversation_mapping: {
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
        if (conv && !conv.deletedAt) {
          this.#logger.debug(
            {
              channel,
              externalId,
              eventId,
              conversationId: conv.id,
            },
            'mapping_resolved_by_event',
          );
          return { conversationId: conv.id, eventId: conv.eventId, created: false };
        }
      }
    }

    const fallbackMapping = await this.prisma.conversationMapping.findFirst({
      where: {
        channel,
        externalId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (fallbackMapping?.conversationId) {
      const conv = await this.prisma.supportConversation.findUnique({
        where: { id: fallbackMapping.conversationId },
      });
      if (conv && !conv.deletedAt) {
        this.#logger.debug(
          {
            channel,
            externalId,
            conversationId: conv.id,
          },
          'mapping_resolved_fallback',
        );
        return { conversationId: conv.id, eventId: conv.eventId, created: false };
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
    mappingType: 'AUTO' | 'MANUAL' | 'FALLBACK' = 'AUTO',
  ): Promise<void> {
    await this.prisma.conversationMapping.upsert({
      where: {
        uq_conversation_mapping: {
          channel,
          externalId,
          eventId,
        },
      },
      create: {
        channel,
        externalId,
        eventId,
        conversationId,
        mappingType,
      },
      update: {
        conversationId,
        mappingType,
      },
    });
  }

  async resolveUniqueInboundMapping(
    channel: ConversationChannel,
    externalId: string,
    eventId?: string,
  ): Promise<MappingResult> {
    const canonicalExternalId = normalizeSupportExternalId(externalId);
    const mappings = await this.prisma.conversationMapping.findMany({
      where: { channel, externalId: canonicalExternalId, ...(eventId ? { eventId } : {}) },
      include: { conversation: true },
    });
    const mapped = mappings.filter(
      ({ conversation }) =>
        conversation && !conversation.deletedAt && conversation.status !== 'CLOSED',
    );
    if (mapped.length === 1 && mapped[0]?.conversationId && mapped[0].eventId) {
      return {
        conversationId: mapped[0].conversationId,
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
        ...(eventId ? { eventId } : {}),
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
      'AUTO',
    );
    return { conversationId: conversation.id, eventId: conversation.eventId, created: true };
  }

  async findByConversation(conversationId: string): Promise<ConversationMapping[]> {
    return this.prisma.conversationMapping.findMany({
      where: { conversationId },
    });
  }
}
