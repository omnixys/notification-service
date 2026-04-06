/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// mail/providers/resend.provider.ts

import { env } from '../../../../config/env.js';
import { SendMailDTO } from '../../models/dto/send-mail.dto.js';
import { Injectable } from '@nestjs/common';
import { OmnixysLogger } from '@omnixys/logger';
import { Resend } from 'resend';
import { MailProvider } from './mail-provider.interface.js';

const { RESEND_API_KEY } = env;
@Injectable()
export class ResendProvider implements MailProvider {
  private resend: Resend;
  private readonly logger;

  constructor(loggerService: OmnixysLogger) {
    this.logger = loggerService.log(this.constructor.name);
    this.resend = new Resend(RESEND_API_KEY);
  }

  async send(dto: SendMailDTO) {
    try {
      const response = await this.resend.emails.send({
        from: dto.from ?? 'no-reply@omnixys.com',
        to: dto.to,
        subject: dto.subject,
        html: dto.html ?? '',
        text: dto.text,
        replyTo: dto.replyTo,
      });

      return {
        provider: 'resend',
        providerRef: response.data?.id,
      };
    } catch (error: any) {
      this.logger.error('Failed to send reset email', {
        to: dto.to,
        error: error?.message,
      });
      throw error;
    }
  }
}
