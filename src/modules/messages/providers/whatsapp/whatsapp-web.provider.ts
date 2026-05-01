import { env } from '../../../../config/env.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import type {
  SendWhatsappInput,
  SendWhatsappResult,
  WhatsAppProvider,
} from './whatsapp.provider.interface.js';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import pkg from 'whatsapp-web.js';
import type WhatsAppWeb from 'whatsapp-web.js';
import type { Client, Message } from 'whatsapp-web.js';

const { MessageAck } = pkg;
type MessageAckType = (typeof MessageAck)[keyof typeof MessageAck];

enum WhatsAppState {
  INITIALIZING = 'INITIALIZING',
  WAITING_FOR_QR = 'WAITING_FOR_QR',
  READY = 'READY',
  DISCONNECTED = 'DISCONNECTED',
}

@Injectable()
export class WhatsAppWebProvider
  implements WhatsAppProvider, OnApplicationBootstrap
{
  private readonly logger = new Logger(WhatsAppWebProvider.name);

  private client: Client | null = null;

  private ready = false;
  private initializing = false;

  private resolveReady: (() => void) | null = null;

  private latestQr?: string;

  private state: WhatsAppState = WhatsAppState.INITIALIZING;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

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
    if (this.ready || this.initializing) {
      return;
    }

    this.initializing = true;
    this.state = WhatsAppState.INITIALIZING;

    const pkg = (await import('whatsapp-web.js')) as typeof WhatsAppWeb & {
      default?: typeof WhatsAppWeb;
    };
    const { Client: WhatsAppClient, LocalAuth } = pkg.default ?? pkg;

    // 🔥 cleanup old client (important!)
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (error) {
        this.logger.debug('Ignoring WhatsApp client destroy error', error);
      }
    }

    const client = new WhatsAppClient({
      authStrategy: new LocalAuth({
        clientId: 'omnixys-whatsapp',
      }),
      puppeteer: {
        executablePath: env.CHROME_PATH,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          ...(env.NODE_ENV === 'production' ? ['--disable-dev-shm-usage'] : []),
        ],
      },
    });

    this.client = client;
    this.registerEvents();

    this.logger.log('Starting WhatsApp Web client...');

    try {
      await client.initialize();
    } catch (err) {
      this.logger.error('Initialization failed', err);
      this.initializing = false;
      this.state = WhatsAppState.DISCONNECTED;
    }
  }

  private registerEvents(): void {
    const client = this.getClient();

    client.on('qr', (qr: string) => {
      this.latestQr = qr;
      this.state = WhatsAppState.WAITING_FOR_QR;

      this.logger.warn('WhatsApp QR Code received');

      this.logger.debug(
        `QR URL: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`,
      );
    });

    client.on('ready', async () => {
      this.logger.log('WhatsApp Web ready');

      this.ready = true;
      this.initializing = false;
      this.state = WhatsAppState.READY;

      this.latestQr = undefined;

      this.resolveReady?.();

      const chats = await client.getChats();
      this.logger.debug('Chats loaded: %s', chats.length);
    });

    client.on('message_ack', async (msg: Message, ack: MessageAckType) => {
      const messageId = msg.id?._serialized;

      if (!messageId) {
        return;
      }

      const status =
        ack === MessageAck.ACK_SERVER
          ? 'SENT'
          : ack === MessageAck.ACK_DEVICE
            ? 'DELIVERED'
            : ack === MessageAck.ACK_READ
              ? 'READ'
              : null;

      if (!status) {
        return;
      }

      await this.prisma.whatsAppMessage.updateMany({
        where: { messageId },
        data: { status },
      });
    });

    client.on('message', (msg: Message) => {
      if (msg.from === 'status@broadcast') {
        return;
      }
    });

    client.on('message_create', (msg: Message) => {
      if (msg.fromMe) {
        return;
      }

      this.logger.debug('🔥 MESSAGE', {
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

    client.on('auth_failure', (msg: string) => {
      this.logger.error('Auth failed: %s', msg);

      this.ready = false;
      this.initializing = false;
      this.state = WhatsAppState.DISCONNECTED;
    });

    client.on('disconnected', (reason: string) => {
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
    if (!this.latestQr) {
      return null;
    }

    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(this.latestQr)}`;
  }

  async send(input: SendWhatsappInput): Promise<SendWhatsappResult> {
    if (!this.ready) {
      await this.init();
    }

    const chatId = this.formatNumber(input.to);

    this.logger.debug('Sending WhatsApp message to %s', chatId);

    return this.getClient().sendMessage(chatId, input.message);
  }

  private getClient(): Client {
    if (!this.client) {
      throw new Error('WhatsApp client is not initialized');
    }

    return this.client;
  }

  private formatNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');

    if (!cleaned) {
      throw new Error('Invalid phone number');
    }

    return `${cleaned}@c.us`;
  }
}
