import type { Channel } from '../../../../prisma/generated/client.js';
import type { Locale } from '@omnixys/shared';

const VERIFICATION_CHANNEL_LABELS: Partial<
  Record<Channel, Record<Locale, string>>
> = {
  EMAIL: {
    'de-DE': 'E-Mail-Adresse',
    'en-US': 'email address',
  },
  WHATSAPP: {
    'de-DE': 'Telefonnummer (WhatsApp)',
    'en-US': 'phone number (WhatsApp)',
  },
  SMS: {
    'de-DE': 'Telefonnummer',
    'en-US': 'phone number',
  },
};

export function getVerificationChannelLabel(
  channel: Channel,
  locale: Locale,
): string {
  return (
    VERIFICATION_CHANNEL_LABELS[channel]?.[locale] ??
    VERIFICATION_CHANNEL_LABELS[channel]?.['en-US'] ??
    channel
  );
}
