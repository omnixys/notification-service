import { WhatsAppRawMessageDTO } from '../../../conversation/modules/message/entities/whatsapp-message.raw.dto.js';
import {
  SendWhatsappInput,
  WhatsAppProvider,
} from './whatsapp.provider.interface.js';
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

enum WhatsAppState {
  INITIALIZING = 'INITIALIZING',
  WAITING_FOR_QR = 'WAITING_FOR_QR',
  READY = 'READY',
  DISCONNECTED = 'DISCONNECTED',
}

export interface MessageAckHandler {
  handleAck(messageId: string, ack: number): Promise<void>;
}

export const MESSAGE_ACK_HANDLER = Symbol('MESSAGE_ACK_HANDLER');

@Injectable()
export class WhatsAppWebProvider
  implements WhatsAppProvider, OnApplicationBootstrap
{
  constructor(
    @Inject(MESSAGE_ACK_HANDLER)
    private readonly ackHandler: MessageAckHandler,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private readonly logger = new Logger(WhatsAppWebProvider.name);

  private client: any;

  private ready = false;
  private initializing = false;

  private resolveReady: (() => void) | null = null;

  private latestQr?: string;

  private state: WhatsAppState = WhatsAppState.INITIALIZING;

  isReady(): boolean {
    return this.ready;
  }

  getState(): WhatsAppState {
    return this.state;
  }

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Bootstrapping WhatsApp Web Provider...');

    void this.init(); // 🔥 non-blocking
  }

  private async init(): Promise<void> {
    if (this.ready || this.initializing) return;

    this.initializing = true;
    this.state = WhatsAppState.INITIALIZING;


    const pkg = await import('whatsapp-web.js');
    const { Client, LocalAuth } = pkg.default ?? pkg;

    // 🔥 cleanup old client (important!)
    if (this.client) {
      try {
        await this.client.destroy();
      } catch {}
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'omnixys-whatsapp',
      }),
      puppeteer: {
        executablePath: process.env.CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.registerEvents();

    this.logger.log('Starting WhatsApp Web client...');

    try {
      await this.client.initialize();
    } catch (err) {
      this.logger.error('Initialization failed', err);
      this.initializing = false;
      this.state = WhatsAppState.DISCONNECTED;
    }
  }

  private registerEvents(): void {
    this.client.on('qr', (qr: string) => {
      this.latestQr = qr;
      this.state = WhatsAppState.WAITING_FOR_QR;

      this.logger.warn('WhatsApp QR Code received');

      this.logger.debug(
        `QR URL: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`,
      );
    });

    this.client.on('ready', async () => {
      this.logger.log('WhatsApp Web ready');

      this.ready = true;
      this.initializing = false;
      this.state = WhatsAppState.READY;

      this.latestQr = undefined;

      this.resolveReady?.();

        const chats = await this.client.getChats();
        console.log('Chats loaded:', chats.length);
    });

    this.client.on('message_ack', (msg: any, ack: number) => {
      const messageId = msg.id?._serialized;

      if (!messageId) return;

      this.ackHandler.handleAck(messageId, ack);
    });

this.client.on('message', (msg: any) => {
  if (msg.from === 'status@broadcast') return;

});

this.client.on('message_create', (msg: WhatsAppRawMessageDTO) => {
  if (!msg.fromMe) return;

  this.logger.debug('🔥 MESSAGE', {
    name: msg._data.notifyName,
    hasMedia: msg.hasMedia,
    text: msg.body,
    type: msg.type,
    timestamp: msg.timestamp,
    from2: msg.from,
    to2: msg.to,
    author: msg.author,
    deviceType: msg.deviceType,
    isForwarded: msg.isForwarded,
    forwardingScore: msg.forwardingScore,
    isStatus: msg.isStatus,
    isStarred: msg.isStarred,
  });

  this.eventEmitter.emit('whatsapp.incoming', msg);
});

 
    this.client.on('auth_failure', (msg: string) => {
      this.logger.error('Auth failed: %s', msg);

      this.ready = false;
      this.initializing = false;
      this.state = WhatsAppState.DISCONNECTED;
    });

    this.client.on('disconnected', (reason: string) => {
      this.logger.warn('Disconnected: %s', reason);

      this.ready = false;
      this.initializing = false;
      this.state = WhatsAppState.DISCONNECTED;

      // 🔥 auto reconnect
      setTimeout(() => {
        void this.init();
      }, 5000);
    });
  }

  getQrCodeUrl(): string | null {
    if (!this.latestQr) return null;

    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(this.latestQr)}`;
  }

  async send(input: SendWhatsappInput): Promise<any> {
    if (!this.ready) {
      await this.init();

    }

    const chatId = this.formatNumber(input.to);

    this.logger.debug('Sending WhatsApp message to %s', chatId);

    const result = await this.client.sendMessage(chatId, input.message);
    return result;
  }

  private formatNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');

    if (!cleaned) {
      throw new Error('Invalid phone number');
    }

    return `${cleaned}@c.us`;
  }
}
