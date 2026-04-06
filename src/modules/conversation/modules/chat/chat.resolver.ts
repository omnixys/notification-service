// modules/chat/chat.resolver.ts

import { ChatService } from './chat.service.js';
import { Chat } from './entities/chat.entity.js';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  CookieAuthGuard,
  CurrentUser,
  CurrentUserData,
  RoleGuard,
  Roles,
} from '@omnixys/security';
import { RealmRoleType } from '@omnixys/shared';

@Resolver()
export class ChatResolver {
  constructor(private readonly chatService: ChatService) {}

  @Mutation(() => Chat)
  @UseGuards(CookieAuthGuard, RoleGuard)
  @Roles(
    RealmRoleType.ADMIN,
    // RealmRoleType.SUPPORT
  )
  async claimChat(
    @Args('chatId') chatId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.chatService.assignChat(chatId, user.id, user);
  }

  async assignChat(
    @Args('chatId') chatId: string,
    @Args('userId') userId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.chatService.assignChat(chatId, userId, user);
  }

  @Query(() => [Chat])
  @UseGuards(CookieAuthGuard)
  async getChats(@CurrentUser() user: CurrentUserData) {
    const chats = await this.chatService.getChats(user);
    console.log({ chats })
    return chats;
  }
}
