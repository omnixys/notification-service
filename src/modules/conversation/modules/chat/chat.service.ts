// modules/chat/chat.service.ts

import type { WhatsAppChat } from '../../../../prisma/generated/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { Injectable } from '@nestjs/common';
import { ValkeyLockService } from '@omnixys/cache';
import { CurrentUserData } from '@omnixys/security';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private lock: ValkeyLockService,
  ) {}

  async assignChat(chatId: string, userId: string, actor: CurrentUserData): Promise<WhatsAppChat> {
    const lockKey = `conversation:chat:assign:${chatId}`;
    const token = await this.lock.acquireLock(lockKey, 3000);

    if (!token) {
      throw new Error('Chat is being assigned by another user');
    }

    try {
      const chat = await this.prisma.whatsAppChat.findUnique({
        where: { chatId },
      });

      if (!chat) {
        throw new Error('Chat not found');
      }

      if (chat.status === 'CLOSED') {
        throw new Error('Chat is closed');
      }

      if (chat.assignedTo && chat.assignedTo !== userId && !actor?.role?.includes('ADMIN')) {
        throw new Error('Chat already assigned');
      }

      const updated = await this.prisma.whatsAppChat.update({
        where: { chatId },
        data: {
          assignedTo: userId,
          status: 'ASSIGNED',
          lastMessageAt: new Date(),
        },
      });

      await this.prisma.whatsAppAssignmentHistory.create({
        data: {
          chatRefId: chat.id,
          assignedTo: userId,
          assignedBy: actor.id,
        },
      });

      return updated;
    } finally {
      await this.lock.releaseLock(lockKey, token);
    }
  }

  async getChats(user: CurrentUserData): Promise<WhatsAppChat[]> {
    if (user.role?.includes('ADMIN')) {
      return this.prisma.whatsAppChat.findMany({
        orderBy: { updatedAt: 'desc' },
      });
    }

    return this.prisma.whatsAppChat.findMany({
      where: {
        OR: [{ assignedTo: user.id }, { assignedTo: null }],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
