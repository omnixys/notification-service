import type { Channel } from '../enums/channel.enum.js';

export interface NotificationCreatedDTO {
  notificationId: string;
  channel: Channel;
  recipient: string;
  renderedTitle?: string | null;
  renderedBody: string;
  linkUrl?: string | null;
}
