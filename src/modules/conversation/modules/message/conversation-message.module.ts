import { MessagingModule } from '../../../messages/messaging.module.js';
import { GraphQLPubSubAdapter } from '../pubsub/pubsub.adapter.js';
import { MessageAckService } from './message-ack.service.js';
import { MessageConsumerService } from './message-consumer.service.js';
import { MessageQueueService } from './message-queue.service.js';
import { MessageResolver } from './message.resolver.js';
import { MessageService } from './message.service.js';
import { Module } from '@nestjs/common';

@Module({
  imports: [MessagingModule],
  providers: [
    MessageService,
    MessageResolver,
    GraphQLPubSubAdapter,
    MessageQueueService,
    MessageConsumerService,
    MessageAckService,
  ],
  exports: [
    MessageService,
    GraphQLPubSubAdapter,
    MessageAckService,
    MessagingModule,
  ],
})
export class ConversationMessageModule {}
