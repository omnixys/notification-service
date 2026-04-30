import type {
  WhatsAppChat,
  WhatsAppMessage,
} from '../../../prisma/generated/client.js';
import { ChatService } from '../../conversation/modules/chat/chat.service.js';
import { Chat } from '../../conversation/modules/chat/entities/chat.entity.js';
import { Message } from '../../conversation/modules/message/entities/message.entity.js';
import { MessageService } from '../../conversation/modules/message/message.service.js';
import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  InputType,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { OmnixysLogger } from '@omnixys/logger';
import {
  CookieAuthGuard,
  CurrentUser,
  CurrentUserData,
  RoleGuard,
  Roles,
} from '@omnixys/security';
import { RealmRoleType } from '@omnixys/shared';

@InputType()
export class SendWhatsappMessageInput {
  @Field()
  phoneNumber!: string;

  @Field()
  message!: string;
}

@InputType()
export class SendWhatsappMessageInput2 {
  @Field()
  chatId!: string;

  @Field()
  message!: string;
}

@InputType()
export class SendInAppMessageInput {
  @Field()
  userId!: string;

  @Field()
  message!: string;

  @Field(() => Boolean, { nullable: true })
  important?: boolean;

  @Field(() => Boolean, { nullable: true })
  secret?: boolean;

  @Field(() => Boolean, { nullable: true })
  viewOnce?: boolean;
}

@InputType()
export class SendEmail {
  @Field()
  email!: string;

  @Field()
  subject!: string;

  @Field()
  body!: string;
}

@Resolver(() => Message)
export class MessageResolver {
  readonly log;
  constructor(
    readonly omnixysLogger: OmnixysLogger,
    private readonly messageService: MessageService,
    private readonly chatService: ChatService,
  ) {
    this.log = omnixysLogger.log(this.constructor.name);
  }

  @Query(() => [Message])
  @UseGuards(CookieAuthGuard)
  async getWhatsappMessages(
    @Args('chatId') chatId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<WhatsAppMessage[]> {
    return this.messageService.getMessages(chatId, user);
  }

  @Mutation(() => Message)
  @UseGuards(CookieAuthGuard)
  async sendWhatsappMessage(
    @Args('input') input: SendWhatsappMessageInput,
    @CurrentUser() user: CurrentUserData,
  ): Promise<WhatsAppMessage> {
    return this.messageService.createOutgoing(
      input.phoneNumber,
      input.message,
      user,
    );
  }

  @Mutation(() => Message)
  @UseGuards(CookieAuthGuard)
  async sendWhatsappMessage2(
    @Args('input') input: SendWhatsappMessageInput2,
    @CurrentUser() user: CurrentUserData,
  ): Promise<WhatsAppMessage | null> {
    return this.messageService.createOutgoing2(
      input.chatId,
      input.message,
      user,
    );
  }

  @Mutation(() => Chat)
  @UseGuards(CookieAuthGuard, RoleGuard)
  @Roles(
    RealmRoleType.ADMIN,
    // RealmRoleType.SUPPORT
  )
  async claimWhatsappChat(
    @Args('chatId') chatId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<WhatsAppChat> {
    return this.chatService.assignChat(chatId, user.id, user);
  }

  async assignWhatsappChat(
    @Args('chatId') chatId: string,
    @Args('userId') userId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<WhatsAppChat> {
    return this.chatService.assignChat(chatId, userId, user);
  }

  @Query(() => [Chat])
  @UseGuards(CookieAuthGuard)
  async getWhatsappChats(
    @CurrentUser() user: CurrentUserData,
  ): Promise<WhatsAppChat[]> {
    return this.chatService.getChats(user);
  }

  @Mutation(() => Boolean)
  @UseGuards(CookieAuthGuard)
  async sendInAppMessage(
    @Args('input') input: SendInAppMessageInput,
    @CurrentUser() user: CurrentUserData,
  ): Promise<boolean> {
    this.log.debug(
      'sendInAppMessage called with input: %o | actor: %o',
      input,
      user,
    );
    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(CookieAuthGuard)
  async sendEmail(
    @Args('input') input: SendEmail,
    @CurrentUser() user: CurrentUserData,
  ): Promise<boolean> {
    this.log.debug('sendEmail called with input: %o | actor: %o', input, user);
    return true;
  }
}
