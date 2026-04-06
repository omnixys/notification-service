// mail/models/dto/send-mail.dto.ts

export type MailFormat = 'HTML' | 'TEXT';

export interface SendMailDTO {
  to: string;
  subject: string;

  html?: string;
  text?: string;

  format?: MailFormat;

  from?: string;
  replyTo?: string;

  metadata?: Record<string, unknown>;
}
