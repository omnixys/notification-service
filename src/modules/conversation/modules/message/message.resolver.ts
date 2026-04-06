// modules/message/message.resolver.ts

import { PrismaService } from '../../../../prisma/prisma.service.js';
import { GraphQLPubSubAdapter } from '../pubsub/pubsub.adapter.js';
import { Message } from './entities/message.entity.js';
import { MessageService } from './message.service.js';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import {
  CookieAuthGuard,
  CurrentUser,
  CurrentUserData,
} from '@omnixys/security';

@Resolver(() => Message)
export class MessageResolver {
  constructor(
    private readonly messageService: MessageService,
    private readonly pubSub: GraphQLPubSubAdapter,
  ) {}

  @Query(() => [Message])
  @UseGuards(CookieAuthGuard)
  async getMessages(
    @Args('chatId') chatId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.messageService.getMessages(chatId, user);
  }

  @Mutation(() => Message)
  @UseGuards(CookieAuthGuard)
  async sendMessage(
    @Args('chatId') chatId: string,
    @Args('message') message: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.messageService.createOutgoing(chatId, message, user);
  }

  @Subscription(() => Message, {
    resolve: (payload) => payload.whatsappMessage,

    filter: async (payload, _variables, context) => {
      const user = context.req.user;
      const prisma: PrismaService = context.prisma;

      const message = payload.whatsappMessage;

      const chat = await prisma.whatsAppChat.findUnique({
        where: { chatId: message.chatId },
      });

      if (!chat) return false;

      // ✅ ADMIN darf alles sehen
      if (user.roles?.includes('ADMIN')) {
        return true;
      }

      // ✅ Nur assigned oder offene Chats
      return !chat.assignedTo || chat.assignedTo === user.id;
    },
  })
  whatsappMessageForUser() {
    return this.pubSub.asyncIterator('whatsapp.message');
  }
}
