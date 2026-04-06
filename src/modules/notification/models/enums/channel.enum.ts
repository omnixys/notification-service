import type { Channel as PrismaChannel } from '../../../../prisma/generated/client.js';
import { registerEnumType } from '@nestjs/graphql';

export enum Channel {
  IN_APP = 'IN_APP',
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
}
registerEnumType(Channel, { name: 'Channel' });

export function toPrismaModelChannel(
  channel: Channel | PrismaChannel | undefined,
): PrismaChannel {
  return channel as PrismaChannel;
}
