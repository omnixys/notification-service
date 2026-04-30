import { ChatResolver } from './chat.resolver.js';
import { ChatService } from './chat.service.js';
import { Module } from '@nestjs/common';

@Module({
  providers: [ChatService, ChatResolver],
  exports: [ChatService],
})
export class ChatModule {}
