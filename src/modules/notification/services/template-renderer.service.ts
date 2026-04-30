import { Channel } from '../models/enums/channel.enum.js';

import { TemplateReadService } from '../../template/services/template-read.service.js';
import { AccountCreatedVariables } from '../models/variables/account-create-notification.variables..js';
import { CreateGuestVariables } from '../models/variables/create-guest.variables.js';
import { MagicLinkVariables } from '../models/variables/magic.link.variables.js';
import { PasswordResetVariables } from '../models/variables/password-reset.variables.js';
import { SignUpVerificationVariables } from '../models/variables/sign-up-verification.variables.js';
import { NotificationRenderer, VariableSchema } from '../utils/notification.renderer.js';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Locale } from '@omnixys/shared';

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
  'auth.sign-up-verification.request': SignUpVerificationVariables;
  'guest.account.created': CreateGuestVariables;
  'account.created': AccountCreatedVariables;
  'invitation.event.invite': SendInvitationVariables;
}

@Injectable()
export class TemplateRenderService {
  constructor(
    private readonly templateReadService: TemplateReadService,
    private readonly renderer: NotificationRenderer,
  ) {}

  async renderFromKey<TKey extends keyof TemplateVariablesMap>(
    input: RenderTemplateInput<TemplateVariablesMap[TKey]> & {
      templateKey: TKey;
    },
  ): Promise<RenderResult> {
    const { template, version } = await this.templateReadService.findActiveByKey(
      input.templateKey,
      input.channel,
      input.locale ?? 'de-DE',
    );

    if (!version) {
      throw new InternalServerErrorException(
        `Active template version missing for key=${input.templateKey}`,
      );
    }

    const variables = input.variables ?? {};

    // 1️⃣ Validate against TemplateVersion schema
    this.renderer.validate((version.variables as VariableSchema) ?? {}, variables);

    // 2️⃣ Render
    const rendered = this.renderer.render(
      {
        title: version.subject ?? undefined,
        body: version.body,
      },
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
