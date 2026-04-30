import { WhatsAppWebProvider } from '../../messages/providers/whatsapp/whatsapp-web.provider.js';
import { NotificationWriteService } from '../services/notification-write.service.js';
import { UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { RequestCookies } from '@omnixys/context';
import { CreateUserInput } from '@omnixys/graphql';
import { OmnixysLogger, LoggingInterceptor } from '@omnixys/logger';
import { CookieAuthGuard, RoleGuard, Roles } from '@omnixys/security';
import { OmnixysCookieRequest, RealmRoleType } from '@omnixys/shared';

@Resolver()
@UseInterceptors(LoggingInterceptor)
export class DebugResolver {
  private readonly logger;

  constructor(
    loggerService: OmnixysLogger,
    private readonly notificationWriteService: NotificationWriteService,
    private readonly whatsAppProvider: WhatsAppWebProvider,
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
