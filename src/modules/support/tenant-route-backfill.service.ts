import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { getLogger } from '@omnixys/logger-ts';

/** Backfills only deployment-approved event routes; unmatched historic rows stay fail-closed. */
@Injectable()
export class TenantRouteBackfillService implements OnApplicationBootstrap {
  readonly #logger = getLogger(TenantRouteBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const [eventId, tenantId] of Object.entries(env.EVENT_TENANT_MAP)) {
      const [conversations, mappings, internalConversations] = await this.prisma.$transaction([
        this.prisma.supportConversation.updateMany({
          where: { eventId, tenantId: null },
          data: { tenantId },
        }),
        this.prisma.conversationMapping.updateMany({
          where: { eventId, tenantId: null },
          data: { tenantId },
        }),
        this.prisma.internalConversation.updateMany({
          where: { eventId, tenantId: null },
          data: { tenantId },
        }),
      ]);
      this.#logger.info(
        {
          eventId,
          conversations: conversations.count,
          mappings: mappings.count,
          internalConversations: internalConversations.count,
        },
        'tenant_route_backfill_completed',
      );
    }
  }
}
