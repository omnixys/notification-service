import {
  SendWhatsappInput,
  SendWhatsappResult,
  WhatsAppProvider,
} from './whatsapp.provider.interface.js';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WhatsAppCloudProvider implements WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppCloudProvider.name);

  private readonly apiUrl = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  private readonly token = process.env.WHATSAPP_ACCESS_TOKEN;

  isReady(): boolean {
    return !!this.token;
  }

  async send(input: SendWhatsappInput): Promise<SendWhatsappResult> {
    if (!this.token) {
      throw new Error('WhatsApp Cloud API token missing');
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: input.to.replace(/\D/g, ''),
      type: 'text',
      text: {
        body: input.message,
      },
    };

    try {
      await axios.post(this.apiUrl, payload, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      this.logger.debug('Cloud WhatsApp sent to %s', input.to);
      return {};
    } catch (error) {
      this.logger.error('Cloud WhatsApp send failed', error);
      throw error;
    }
  }
}
