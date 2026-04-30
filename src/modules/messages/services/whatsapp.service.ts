import {
  WhatsAppProvider,
  SendWhatsappInput,
} from '../providers/whatsapp/whatsapp.provider.interface.js';
import { WHATSAPP_PROVIDER } from '../providers/whatsapp/whatsapp.provider.token.js';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class WhatsAppService {
  constructor(
    @Inject(WHATSAPP_PROVIDER)
    private readonly provider: WhatsAppProvider,
  ) {}

  async send(input: SendWhatsappInput): Promise<void> {
    await this.provider.send(input);
  }
}
