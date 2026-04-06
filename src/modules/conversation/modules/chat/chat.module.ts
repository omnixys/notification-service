import { Module } from "@nestjs/common";
import { ChatResolver } from "./chat.resolver.js";
import { ChatService } from "./chat.service.js";

@Module({
  providers: [ChatService, ChatResolver],
})
export class ChatModule {}
