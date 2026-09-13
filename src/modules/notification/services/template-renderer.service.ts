import { TemplateStateException } from '../errors/notification.error.js';
import { Channel, toPrismaModelChannel } from '../models/enums/channel.enum.js';

import { TemplateReadService } from '../../template/services/template-read.service.js';
import { AccountCreatedVariables } from '../models/variables/account-create-notification.variables..js';
import { CreateGuestVariables } from '../models/variables/create-guest.variables.js';
import { MagicLinkVariables } from '../models/variables/magic.link.variables.js';
import { PasswordResetVariables } from '../models/variables/password-reset.variables.js';
import { SignUpVerificationVariables } from '../models/variables/sign-up-verification.variables.js';
import { NotificationRenderer, VariableSchema } from '../utils/notification.renderer.js';
import { Injectable } from '@nestjs/common';
import type { Locale } from '@omnixys/contracts-ts';
import { getLogger } from '@omnixys/logger-ts';

export interface RenderTemplateInput<TVariables = Record<string, unknown>> {
  templateKey: string;
  channel: Channel;
  locale?: Locale;
  variables?: TVariables;
}

interface RenderResult {
  templateId: string;
  version: number;
  renderedTitle?: string;
  renderedBody: string;
}

export interface SendInvitationVariables {
  firstName: string;
  lastName: string;
  eventName: string;
  rsvpUrl: string;
  plusOnes?: number;
  hostName?: string;
}

export interface TemplateVariablesMap {
  'auth.password-reset.request': PasswordResetVariables;
  'auth.magic-link.request': MagicLinkVariables;
  'auth.guest-magic-link.request': MagicLinkVariables;
  'auth.sign-up-verification.request': SignUpVerificationVariables;
  'guest.account.created': CreateGuestVariables;
  'account.created': AccountCreatedVariables;
  'invitation.event.invite': SendInvitationVariables;
}

@Injectable()
export class TemplateRenderService {
  private readonly logger = getLogger(TemplateRenderService.name);

  constructor(
    private readonly templateReadService: TemplateReadService,
    private readonly renderer: NotificationRenderer,
  ) {}

  async renderFromKey<TKey extends keyof TemplateVariablesMap>(
    input: RenderTemplateInput<TemplateVariablesMap[TKey]> & {
      templateKey: TKey;
    },
  ): Promise<RenderResult> {
    const locale = input.locale ?? 'de-DE';

    this.logger.debug(
      'renderFromKey template lookup started: key=%s channel=%s locale=%s',
      input.templateKey,
      input.channel,
      locale,
    );

    try {
      const { template, version } = await this.templateReadService.findActiveByKey(
        input.templateKey,
        input.channel,
        locale,
      );

      if (!version) {
        throw new TemplateStateException('active-version-missing', {
          templateKey: input.templateKey,
          channel: input.channel,
          locale,
        });
      }

      this.logger.debug(
        'renderFromKey template loaded: key=%s templateId=%s version=%s',
        input.templateKey,
        template.id,
        version.version,
      );

      const variables = input.variables ?? {};

      // 1️⃣ Validate against TemplateVersion schema
      this.logger.debug('renderFromKey template validation started: key=%s', input.templateKey);
      this.renderer.validate((version.variables as VariableSchema) ?? {}, variables);

      // 2️⃣ Render
      this.logger.debug('renderFromKey template rendering started: key=%s', input.templateKey);
      const rendered = this.renderer.render(
        {
          title: version.subject ?? undefined,
          body: version.body,
        },
        variables,
      );

      this.logger.debug(
        'renderFromKey template rendered successfully: key=%s templateId=%s version=%s',
        input.templateKey,
        template.id,
        version.version,
      );

      return {
        templateId: template.id,
        version: version.version,
        renderedTitle: rendered.title,
        renderedBody: rendered.body,
      };
    } catch (error: unknown) {
      this.logger.error(
        'renderFromKey failed: key=%s channel=%s locale=%s error=%s',
        input.templateKey,
        input.channel,
        locale,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async renderFromId(input: {
    templateId: string;
    channel: Channel;
    locale?: string;
    variables?: Record<string, unknown>;
  }): Promise<RenderResult> {
    const template = await this.templateReadService.findById(input.templateId);
    if (template.channel !== toPrismaModelChannel(input.channel)) {
      throw new TemplateStateException('template-channel-mismatch', {
        templateId: input.templateId,
        expectedChannel: input.channel,
        actualChannel: template.channel,
      });
    }
    const locale = input.locale ?? 'de-DE';
    const version = template.versions
      .filter((candidate) => candidate.isActive && candidate.locale === locale)
      .sort((left, right) => right.version - left.version)[0];
    if (!version) {
      throw new TemplateStateException('active-version-missing', {
        templateId: input.templateId,
        locale,
      });
    }
    const variables = input.variables ?? {};
    this.renderer.validate((version.variables as VariableSchema) ?? {}, variables);
    const rendered = this.renderer.render(
      { title: version.subject ?? undefined, body: version.body },
      variables,
    );
    return {
      templateId: template.id,
      version: version.version,
      renderedTitle: rendered.title,
      renderedBody: rendered.body,
    };
  }
}
