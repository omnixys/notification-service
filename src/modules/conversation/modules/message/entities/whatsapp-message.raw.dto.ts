// whatsapp-message.raw.dto.ts

export interface WhatsAppMessageIdDTO {
  fromMe: boolean;
  remote: string; // e.g. 4915...@c.us
  id: string;
  self: 'in' | 'out';
  _serialized: string;
}

export interface WhatsAppMessageDataDTO {
  id: WhatsAppMessageIdDTO;

  body: string;
  type: string;

  from: string;
  to: string;
  author?: string;

  t: number; // unix timestamp
  clientReceivedTsMillis?: number;

  notifyName?: string;

  ack: number;

  isNewMsg: boolean;
  isForwarded: boolean;

  mentionedJidList: string[];
  groupMentions: unknown[];

  links: unknown[];

  // optional / noisy fields (keep minimal)
  viewed?: boolean;
  invis?: boolean;
  star?: boolean;
}

export interface WhatsAppRawMessageDTO {
  _data: WhatsAppMessageDataDTO;

  id: WhatsAppMessageIdDTO;

  body: string;
  type: string;

  from: string;
  to: string;
  author?: string;

  timestamp: number;

  ack: number;

  fromMe: boolean;

  hasMedia: boolean;

  deviceType?: string;

  isForwarded: boolean;
  forwardingScore: number;

  isStatus: boolean;
  isStarred: boolean;

  hasQuotedMsg: boolean;
  hasReaction: boolean;

  mentionedIds: string[];
  groupMentions: unknown[];

  links: unknown[];
}
