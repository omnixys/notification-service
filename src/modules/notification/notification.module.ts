import { MessagingModule } from '../messages/messaging.module.js';
import { SupportCommonModule } from '../support/common/support-common.module.js';
import { TemplateModule } from '../template/template.module.js';
import { GuestMagicLinkMetricsService } from './metrics/guest-magic-link.metrics.service.js';
import { DebugResolver } from './resolver/debug.resolver.js';
import { NotificationMutationResolver } from './resolver/notification-mutation.resolver.js';
import { NotificationQueryResolver } from './resolver/notification-query.resolver.js';
import { NotificationCacheService } from './services/notification-cache.service.js';
import { NotificationReadService } from './services/notification-read.service.js';
import { NotificationWriteService } from './services/notification-write.service.js';
import { TemplateRenderService } from './services/template-renderer.service.js';
import { NotificationRenderer } from './utils/notification.renderer.js';
import { Module } from '@nestjs/common';

@Module({
  imports: [TemplateModule, MessagingModule, SupportCommonModule],
  providers: [
    NotificationRenderer,
    DebugResolver,
    NotificationQueryResolver,
    NotificationMutationResolver,
    NotificationReadService,
    NotificationWriteService,
    NotificationCacheService,
    TemplateRenderService,
    GuestMagicLinkMetricsService,
  ],
  exports: [
    NotificationReadService,
    NotificationWriteService,
    TemplateRenderService,
    GuestMagicLinkMetricsService,
  ],
})
export class NotificationModule {}
