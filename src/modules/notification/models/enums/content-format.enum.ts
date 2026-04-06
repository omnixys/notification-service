import type { ContentFormat as PrismaContentFormat } from '../../../../prisma/generated/client.js';
import { registerEnumType } from '@nestjs/graphql';

export enum ContentFormat {
  TEXT = 'TEXT',
  HTML = 'HTML',
  MARKDOWN = 'MARKDOWN',
}
registerEnumType(ContentFormat, { name: 'ContentFormat' });

export function toPrismaModelContentFormat(
  channel: ContentFormat | undefined,
): PrismaContentFormat {
  return channel as PrismaContentFormat;
}
