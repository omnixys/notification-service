import { MessagingModule } from '../../../messages/messaging.module.js';
import { GraphQLPubSubAdapter } from '../pubsub/pubsub.adapter.js';
import { MessageService } from './message.service.js';
import { Module } from '@nestjs/common';

@Module({
  imports: [MessagingModule],
  providers: [MessageService, GraphQLPubSubAdapter],
  exports: [MessageService, GraphQLPubSubAdapter, MessagingModule],
})
export class ConversationMessageModule {}
