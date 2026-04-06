/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { PrismaService } from '../../../prisma/prisma.service.js';
import { toPrismaModelChannel } from '../models/enums/channel.enum.js';
import { NotificationFilterInput } from '../models/inputs/notification-filter.input.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { OmnixysLogger } from '@omnixys/logger';

@Injectable()
export class NotificationReadService {
  private readonly logger;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: OmnixysLogger,
  ) {
    this.logger = loggerService.log(this.constructor.name);
  }

  // ─────────────────────────────────────────────
  // FIND BY ID
  // ─────────────────────────────────────────────
  async findById(id: string) {
    this.logger.debug('findById: id=%s', id);

    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  // ─────────────────────────────────────────────
  // FIND WITH OPTIONAL FILTER
  // ─────────────────────────────────────────────
  async find(filter?: NotificationFilterInput, limit = 50) {
    this.logger.debug('find: filter=%o limit=%s', filter, limit);

    const where: any = {};

    if (filter?.recipientId) {
      where.recipientId = filter.recipientId;
    }

    if (filter?.status) {
      where.status = filter.status;
    }

    if (filter?.channel) {
      where.channel = toPrismaModelChannel(filter.channel);
    }

    if (filter?.unreadOnly) {
      where.readAt = null;
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  // ─────────────────────────────────────────────
  // FIND BY USER ID
  // ─────────────────────────────────────────────
  async findByUserId(recipientId: string, limit = 50) {
    this.logger.debug('findByUserId: recipientId=%s', recipientId);

    return this.prisma.notification.findMany({
      where: {
        recipientId,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }
}

// await mailService.send({
//   to: notification.recipientUsername,
//   subject: notification.renderedTitle ?? 'Notification',
//   html: notification.renderedBody,
// });
