import { NotificationEventRoleResolver } from './event-role-resolver.service.js';
import { TenantRouteService } from './tenant-route.service.js';
import { Module } from '@nestjs/common';
import { EventPermissionResolver, EventRoleResolver } from '@omnixys/security-ts';

@Module({
  providers: [
    TenantRouteService,
    {
      provide: EventRoleResolver,
      useClass: NotificationEventRoleResolver,
    },
    {
      provide: EventPermissionResolver,
      useExisting: EventRoleResolver,
    },
  ],
  exports: [EventRoleResolver, EventPermissionResolver, TenantRouteService],
})
export class SupportCommonModule {}
