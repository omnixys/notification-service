/**
 * @license GPL-3.0-or-later
 * Copyright (C) 2025 Caleb Gyamfi - Omnixys Technologies
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * For more information, visit <https://www.gnu.org/licenses/>.
 */

import { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Injectable } from '@nestjs/common';
import {
  EventAccessDTO,
  EventCancelNotificationDTO,
  EventIdsDTO,
  UserProjectionChangedDTO,
} from '@omnixys/contracts-ts';
import {
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
  IKafkaEventContext,
  KAFKA_HEADERS,
} from '@omnixys/kafka-ts';
import { OmnixysLogger } from '@omnixys/logger-ts';
import { TraceRunner } from '@omnixys/observability-ts';

/**
 * Kafka event handler responsible for useristrative commands such as
 * shutdown and restart. It listens for specific user-related topics
 * and delegates the actual process control logic to the {@link UserService}.
 *
 * @category Messaging
 * @since 1.0.0
 */
@KafkaEventHandler('event')
@Injectable()
export class EventHandler {
  private readonly logger;

  /**
   * Creates a new instance of {@link EventHandler}.
   *
   * @param loggerService - The central logger service used for structured logging.
   * @param userService - The service responsible for handling system-level user operations.
   */
  constructor(
    private readonly omnixysLogger: OmnixysLogger,
    private readonly prisma: PrismaService,
    // private readonly notificationWriteService: NotificationWriteService,
  ) {
    this.logger = this.omnixysLogger.log(
      'service:notification',
      this.constructor.name,
    );
  }

  @KafkaEvent(KafkaTopics.event.userAccessChanged)
  async handleUserAccessChanged(
    payload: EventAccessDTO,
    _context: IKafkaEventContext,
  ): Promise<void> {
    return TraceRunner.run('[HANDLER] event.userAccessChanged', async () => {
      const { eventId, userId, permissions, roles, occurredAt } = payload;
      const occurredAtDate = new Date(occurredAt);

      const existing = await this.prisma.eventAccessProjection.findUnique({
        where: { uq_event_access_projection: { eventId, userId } },
        select: { occurredAt: true },
      });

      if (
        existing?.occurredAt &&
        occurredAtDate.getTime() < existing.occurredAt.getTime()
      ) {
        this.logger.debug('Skipping stale event.userAccessChanged: %o', {
          eventId,
          userId,
        });
        return;
      }

      await this.prisma.eventAccessProjection.upsert({
        where: { uq_event_access_projection: { eventId, userId } },
        create: {
          eventId,
          userId,
          permissions,
          roles: roles as unknown as Prisma.InputJsonValue,
          occurredAt: occurredAtDate,
        },
        update: {
          permissions,
          roles: roles as unknown as Prisma.InputJsonValue,
          occurredAt: occurredAtDate,
        },
      });
    });
  }

  @KafkaEvent(KafkaTopics.user.changedProjection)
  async handleUserProjectionChanged(
    payload: UserProjectionChangedDTO,
    _context: IKafkaEventContext,
  ): Promise<void> {
    await this.prisma.userContactProjection.upsert({
      where: { userId: payload.id },
      create: {
        userId: payload.id,
        email: normalizeEmail(payload.email),
        primaryPhone: normalizePhone(payload.primaryPhone),
        displayName: payload.displayName?.trim() ?? null,
      },
      update: {
        email: normalizeEmail(payload.email),
        primaryPhone: normalizePhone(payload.primaryPhone),
        displayName: payload.displayName?.trim() ?? null,
      },
    });
  }

  @KafkaEvent(KafkaTopics.notification.eventCancelled)
  async handleNotifyEventCancelled(
    payload: EventCancelNotificationDTO,
    context: IKafkaEventContext,
  ): Promise<void> {
    return TraceRunner.run('[HANDLER] handleNotifyEventCancelled', async () => {
      // const { eventIds, admins, security, guests} = payload;
      const headers = context.headers;
      const actorId = headers[KAFKA_HEADERS.ACTOR_ID] ?? 'Unkown';

      this.logger.debug(
        'handleNotifyEventCancelled message received: eventCount=%s actorId=%s',
        payload.eventIds.length,
        actorId,
      );
      this.logger.warn(
        'handleNotifyEventCancelled message ignored: processing is not implemented actorId=%s',
        actorId,
      );

      // await this.notificationWriteService.deleteByEventIds(payload.eventIds);
    });
  }

  @KafkaEvent(KafkaTopics.event.deleted)
  async handleEventDeleted(
    payload: EventIdsDTO,
    _context: IKafkaEventContext,
  ): Promise<void> {
    return TraceRunner.run('[HANDLER] event.deleted', async () => {
      this.logger.info('event_deleted_received: %o', {
        eventIds: payload.eventIds,
      });
      try {
        const result = await this.prisma.eventAccessProjection.deleteMany({
          where: { eventId: { in: payload.eventIds } },
        });
        this.logger.info('event_deleted_projections_removed: %o', {
          eventIds: payload.eventIds,
          count: result.count,
        });
      } catch (error) {
        this.logger.error('event_deleted_failed: %o', {
          eventIds: payload.eventIds,
          error,
        });
      }
    });
  }
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ?? null;
}

function normalizePhone(value: string | null | undefined): string | null {
  const normalized = value?.replace(/[^\d+]/g, '').replace(/^00/, '+');
  return normalized ?? null;
}
