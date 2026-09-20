import type {
  InternalParticipant as PrismaInternalParticipant,
} from '../../prisma/generated/client.js';
import {
  InternalConversation,
  InternalConversationType,
  InternalMessage,
  InternalMessagePriority,
  InternalParticipant,
  mapConversationChannel,
  mapMessageChannel,
} from './entities/internal-conversation.entity.js';
import { InternalService } from './internal.service.js';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  CookieAuthGuard,
  CurrentUser,
  CurrentUserData,
} from '@omnixys/security-ts';

@Resolver()
export class InternalResolver {
  constructor(private readonly internalService: InternalService) {}

  @Query(() => [InternalConversation])
  @UseGuards(CookieAuthGuard)
  async internalConversations(
    @Args('eventId') eventId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<InternalConversation[]> {
    const conversations = await this.internalService.findConversations(eventId, user);
    return conversations.map(mapConversationChannel) as unknown as InternalConversation[];
  }

  @Query(() => InternalConversation)
  @UseGuards(CookieAuthGuard)
  async internalConversation(
    @Args('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<InternalConversation> {
    const conversation = await this.internalService.findConversationById(id, user);
    return mapConversationChannel(conversation) as unknown as InternalConversation;
  }

  @Query(() => [InternalMessage])
  @UseGuards(CookieAuthGuard)
  async internalMessages(
    @Args('conversationId') conversationId: string,
    @CurrentUser() user: CurrentUserData,
    @Args('limit', { nullable: true, type: () => Number }) limit?: number,
  ): Promise<InternalMessage[]> {
    const messages = await this.internalService.findMessages(conversationId, user, limit);
    return messages.map(mapMessageChannel) as unknown as InternalMessage[];
  }

  @Mutation(() => InternalConversation)
  @UseGuards(CookieAuthGuard)
  async createInternalConversation(
    @CurrentUser() user: CurrentUserData,
    @Args('eventId') eventId: string,
    @Args('title') title: string,
    @Args('type', { type: () => InternalConversationType })
    type: InternalConversationType,
    @Args('description', { nullable: true }) description?: string,
    @Args('participantIds', { nullable: true, type: () => [String] })
    participantIds?: string[],
  ): Promise<InternalConversation> {
    const conversation = await this.internalService.createConversation(
      eventId,
      {
        title,
        description,
        type,
        participantIds,
      },
      user,
    );
    return mapConversationChannel(conversation) as unknown as InternalConversation;
  }

  @Mutation(() => InternalMessage)
  @UseGuards(CookieAuthGuard)
  async sendInternalMessage(
    @CurrentUser() user: CurrentUserData,
    @Args('conversationId') conversationId: string,
    @Args('body') body: string,
    @Args('priority', { nullable: true, type: () => InternalMessagePriority })
    priority?: InternalMessagePriority,
  ): Promise<InternalMessage> {
    const message = await this.internalService.sendMessage(
      conversationId,
      {
        body,
        priority,
      },
      user,
    );
    return mapMessageChannel(message) as unknown as InternalMessage;
  }

  @Mutation(() => InternalParticipant)
  @UseGuards(CookieAuthGuard)
  async markInternalConversationRead(
    @CurrentUser() user: CurrentUserData,
    @Args('conversationId') conversationId: string,
  ): Promise<PrismaInternalParticipant> {
    return this.internalService.markAsRead(conversationId, user);
  }

  @Mutation(() => InternalConversation)
  @UseGuards(CookieAuthGuard)
  async archiveInternalConversation(
    @CurrentUser() user: CurrentUserData,
    @Args('id') id: string,
  ): Promise<InternalConversation> {
    const conversation = await this.internalService.archiveConversation(id, user);
    return mapConversationChannel(conversation) as unknown as InternalConversation;
  }
}
