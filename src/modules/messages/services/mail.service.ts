/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { SendMailDTO } from '../models/dto/send-mail.dto.js';
import { MailProvider } from '../providers/mail/mail-provider.interface.js';
import { MAIL_PROVIDER } from '../providers/mail/mail-provider.token.js';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { OmnixysLogger } from '@omnixys/logger';

@Injectable()
export class MailService {
  private readonly logger;

  constructor(
    loggerService: OmnixysLogger,
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
  ) {
    this.logger = loggerService.log(this.constructor.name);
  }

  async send(dto: SendMailDTO) {
    this.logger.debug('Sending mail to=%s subject=%s', dto.to, dto.subject);

    if (!dto.html && !dto.text) {
      throw new InternalServerErrorException('Mail must contain either html or text content');
    }

    try {
      const result = await this.provider.send(dto);

      this.logger.info('Mail sent successfully to=%s providerRef=%s', dto.to, result.providerRef);

      return result;
    } catch (error) {
      this.logger.error('Mail sending failed to=%s error=%o', dto.to, error);

      throw new InternalServerErrorException('Mail sending failed');
    }
  }
}
