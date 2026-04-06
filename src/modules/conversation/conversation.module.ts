/**
 * @license GPL-3.0-or-later
 * Copyright (C) 2025 Caleb Gyamfi - Omnixys Technologies
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * For more information, visit <https://www.gnu.org/licenses/>.
 */

import { MESSAGE_ACK_HANDLER } from '../messages/providers/whatsapp/whatsapp-web.provider.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { ConversationMessageModule } from './modules/message/conversation-message.module.js';
import { MessageAckService } from './modules/message/message-ack.service.js';
import { Module } from '@nestjs/common';

@Module({
  imports: [ChatModule, ConversationMessageModule],
  providers: [
    MessageAckService,
    {
      provide: MESSAGE_ACK_HANDLER,
      useExisting: MessageAckService,
    },
  ],
  exports: [],
})
export class ConversationModule {}
