// messages/infrastructure/stream-bootstrap.service.ts

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ValkeyService } from '@omnixys/cache';

@Injectable()
export class StreamBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(StreamBootstrapService.name);

  constructor(private readonly valkey: ValkeyService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureStream('whatsapp:outgoing', 'whatsapp-group');
  }

  private async ensureStream(stream: string, group: string): Promise<void> {
    try {
      await this.valkey.client.xGroupCreate(stream, group, '0', {
        MKSTREAM: true, // 🔥 CRITICAL
      });

      this.logger.log(`Stream created: ${stream}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('BUSYGROUP')) {
        this.logger.debug(`Group exists: ${stream}`);
        return;
      }

      throw err;
    }
  }
}
