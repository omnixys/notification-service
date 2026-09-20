import { AnalyticsOutboxService } from './analytics-outbox.service.js';
import { ConversationOutboxService } from './conversation-outbox.service.js';
import { OutboxPublisherService } from './outbox-publisher.service.js';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  providers: [AnalyticsOutboxService, ConversationOutboxService, OutboxPublisherService],
  exports: [AnalyticsOutboxService, ConversationOutboxService, OutboxPublisherService],
})
export class OutboxModule {}
