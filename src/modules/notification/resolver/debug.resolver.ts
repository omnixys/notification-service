/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { MessageService } from '../../conversation/modules/message/message.service.js';
import { WhatsAppWebProvider } from '../../messages/providers/whatsapp/whatsapp-web.provider.js';
import { NotificationWriteService } from '../services/notification-write.service.js';
import { UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Field, InputType } from '@nestjs/graphql';
import { RequestCookies } from '@omnixys/context';
import { CreateUserInput } from '@omnixys/graphql';
import { OmnixysLogger, LoggingInterceptor } from '@omnixys/logger';
import { CookieAuthGuard, CurrentUser, CurrentUserData, RoleGuard, Roles } from '@omnixys/security';
import { OmnixysCookieRequest, RealmRoleType } from '@omnixys/shared';

@InputType()
export class SendMessageInput {
  @Field()
  to!: string;

  @Field()
  message!: string;
}

@Resolver()
@UseInterceptors(LoggingInterceptor)
export class DebugResolver {
  private readonly logger;

  constructor(
    loggerService: OmnixysLogger,
    private readonly notificationWriteService: NotificationWriteService,
    private readonly whatsAppProvider: WhatsAppWebProvider,
    private readonly messageService: MessageService,
  ) {
    this.logger = loggerService.log(this.constructor.name);
  }

  @Query(() => String, { nullable: true })
  getQr(): string | null {
    const url = this.whatsAppProvider.getQrCodeUrl();

    this.logger.debug('QR requested: %s', url ?? 'null');

    return url;
  }
  @Query(() => String)
  getWhatsappState(): string {
    return this.whatsAppProvider.getState();
  }

  @Mutation(() => Boolean)
    @UseGuards(CookieAuthGuard)
  async sendTestMessage(
    @Args('input') input: SendMessageInput,
    @CurrentUser() user: CurrentUserData,
  ): Promise<boolean> {
    const { to, message } = input;
    this.logger.debug('Sending test message to %s', to);

    await this.messageService.createOutgoing(to, message, user);

    return true;
  }

  @Mutation(() => String, { name: 'DEBUG_createSignupVerification' })
  @UseGuards(CookieAuthGuard, RoleGuard)
  @Roles(RealmRoleType.ADMIN)
  async createSignupVerification(
    @Args('createUserInput') createUserInput: CreateUserInput,
    @RequestCookies() cookies: OmnixysCookieRequest,
  ): Promise<string> {
    const locale = cookies.locale ?? 'en-US';

    this.logger.debug(
      'createSignupVerification: username=%s locale=%s',
      createUserInput.username,
      locale,
    );

    const payload =
      await this.notificationWriteService.createSignupVerification({
        createUserInput,
        locale,
      });

    return payload;
  }
}
