/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/notification/models/mappers/notification.mapper.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Notification } from '../../../../prisma/generated/client.js';
import type { NotificationPayload } from '../payloads/notification.payload.js';

export class NotificationMapper {
  static toPayload(entity: Notification): NotificationPayload {
    return {
      id: entity.id,
      tenantId: entity.tenantId ?? undefined,

      recipientUsername: entity.recipientUsername,
      recipientId: entity.recipientId ?? undefined,
      recipientAddress: entity.recipientAddress ?? undefined,

      channel: entity.channel as any,
      priority: entity.priority as any,
      status: entity.status as any,

      variables: entity.variables as Record<string, unknown>,
      metadata: entity.metadata as Record<string, unknown>,

      sensitive: entity.sensitive,

      readAt: entity.readAt ?? undefined,
      deliveredAt: entity.deliveredAt ?? undefined,
      expiresAt: entity.expiresAt ?? undefined,
      archivedAt: entity.archivedAt ?? undefined,
      purgedAt: entity.purgedAt ?? undefined,

      createdBy: entity.createdBy ?? undefined,
      provider: entity.provider ?? undefined,
      providerRef: entity.providerRef ?? undefined,

      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toPayloadList(entities: Notification[]): NotificationPayload[] {
    return entities.map((e) => this.toPayload(e));
  }
}
