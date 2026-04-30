import { ConversationModule } from '../conversation/conversation.module.js';
import { TemplateModule } from '../template/template.module.js';
import { DebugResolver } from './resolver/debug.resolver.js';
import { MessageResolver } from './resolver/message.resolver.js';
import { NotificationMutationResolver } from './resolver/notification-mutation.resolver.js';
import { NotificationQueryResolver } from './resolver/notification-query.resolver.js';
import { NotificationCacheService } from './services/notification-cache.service.js';
import { NotificationReadService } from './services/notification-read.service.js';
import { NotificationWriteService } from './services/notification-write.service.js';
import { TemplateRenderService } from './services/template-renderer.service.js';
import { NotificationRenderer } from './utils/notification.renderer.js';
import { Module } from '@nestjs/common';

@Module({
  imports: [TemplateModule, ConversationModule],
  providers: [
    NotificationRenderer,
    NotificationQueryResolver,
    NotificationMutationResolver,
    MessageResolver,
    DebugResolver,
    NotificationReadService,
    NotificationWriteService,
    NotificationCacheService,
    TemplateRenderService,
  ],
  exports: [NotificationReadService, NotificationWriteService, TemplateRenderService],
})
export class NotificationModule {}
