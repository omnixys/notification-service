// mail/providers/mail-provider.interface.ts

import type { SendMailDTO } from '../../models/dto/send-mail.dto.js';

export interface MailProvider {
  send(dto: SendMailDTO): Promise<{
    provider: string;
    providerRef?: string;
  }>;
}
