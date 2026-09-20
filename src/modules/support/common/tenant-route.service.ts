import { env } from '../../../config/env.js';
import { ConversationAccessDeniedException } from '../../notification/errors/notification.error.js';
import { Injectable } from '@nestjs/common';
import { ContextAccessor } from '@omnixys/context-ts';

@Injectable()
export class TenantRouteService {
  matchesEventTenant(eventId: string, tenantId: string | undefined): boolean {
    return Boolean(tenantId) && env.EVENT_TENANT_MAP[eventId] === tenantId;
  }

  requireEventTenant(eventId: string): string {
    const configuredTenantId = env.EVENT_TENANT_MAP[eventId];
    if (!configuredTenantId) {
      throw new ConversationAccessDeniedException(eventId, 'tenant-route-required');
    }

    const context = ContextAccessor.get();
    if (context?.tenant) {
      if (!context.tenant.verified || context.tenant.tenantId !== configuredTenantId) {
        throw new ConversationAccessDeniedException(eventId, 'tenant-context-mismatch');
      }
    }

    return configuredTenantId;
  }

  requireCurrentTenant(): string {
    const tenant = ContextAccessor.get()?.tenant;
    if (!tenant?.verified) {
      throw new ConversationAccessDeniedException(undefined, 'verified-tenant-required');
    }
    return tenant.tenantId;
  }
}
