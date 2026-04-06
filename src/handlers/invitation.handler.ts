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

import { Injectable } from '@nestjs/common';
import { ValkeyKey, ValkeyService } from '@omnixys/cache';
import {
  CreatePendingUserDTO,
  GuestNotificationDTO,
} from '@omnixys/shared';

import { NotificationWriteService } from '../modules/notification/services/notification-write.service.js';
import {
  IKafkaEventContext,
  KAFKA_HEADERS,
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from '@omnixys/kafka';
import { OmnixysLogger } from '@omnixys/logger';
import { TraceRunner } from '@omnixys/observability';

/**
 * Kafka event handler responsible for useristrative commands such as
 * shutdown and restart. It listens for specific user-related topics
 * and delegates the actual process control logic to the {@link UserService}.
 *
 * @category Messaging
 * @since 1.0.0
 */
@KafkaEventHandler('invitation')
@Injectable()
export class InvitationHandler {
  private readonly logger;

  /**
   * Creates a new instance of {@link UserHandler}.
   *
   * @param loggerService - The central logger service used for structured logging.
   * @param userService - The service responsible for handling system-level user operations.
   */
  constructor(
    loggerService: OmnixysLogger,
    private readonly service: NotificationWriteService,
    private readonly cache: ValkeyService,
  ) {
    this.logger = loggerService.log(this.constructor.name);
  }

  @KafkaEvent(KafkaTopics.notification.confirmGuest)
  async handleAddGuestId(
    payload: GuestNotificationDTO,
    context: IKafkaEventContext,
  ) {
    return TraceRunner.run('[HANDLER] confirmGuest', async () => {
      const { token, eventName, seat, seatId } = payload;

      const headers = context.headers;

      console.log({ headers });

      const actorId = headers[KAFKA_HEADERS.ACTOR_ID] ?? 'Unkown';

      this.logger.debug(
        'Confirming guest fo event %s with seat %s with token: %s | Actor=%s',
        eventName,
        seat,
        actorId,
      );

      const raw = await this.cache.get(ValkeyKey.pendingContact, token);

      console.log({ raw });
      if (!raw) {
        this.logger.warn('Token not found or already consumed: %s', token);
        throw new Error('Invalid or expired token');
      }

      const input = JSON.parse(raw) as CreatePendingUserDTO;

      const finalInput: CreatePendingUserDTO = {
        ...input,
        seatId,
        actorId,
      };

      try {
        await this.service.confirmGuest(finalInput, eventName, seat);

        await this.cache.delete(ValkeyKey.pendingContact, token);
      } catch (e: any) {
        this.logger.error(e);
        throw new Error('Already Confirmed bzw. kp');
      }
    });
  }
}
