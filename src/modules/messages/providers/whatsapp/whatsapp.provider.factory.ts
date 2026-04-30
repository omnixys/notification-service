import { WhatsAppCloudProvider } from './whatsapp-cloud.provider.js';
import { WhatsAppWebProvider } from './whatsapp-web.provider.js';
import type { WhatsAppProvider } from './whatsapp.provider.interface.js';
import { WHATSAPP_PROVIDER } from './whatsapp.provider.token.js';
import type { Provider } from '@nestjs/common';

export const WhatsAppProviderFactory: Provider = {
  provide: WHATSAPP_PROVIDER,
  useFactory: async (
    cloud: WhatsAppCloudProvider,
    web: WhatsAppWebProvider,
  ): Promise<WhatsAppProvider> => {
    if (cloud.isReady()) {
      return cloud;
    }

    return web;
  },
  inject: [WhatsAppCloudProvider, WhatsAppWebProvider],
};
