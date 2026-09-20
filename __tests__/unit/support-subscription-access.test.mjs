import assert from 'node:assert/strict';
import test from 'node:test';

import { EventPermissionKey } from '@omnixys/contracts-ts';
import { ConversationService } from '../../dist/modules/support/modules/conversation/conversation.service.js';

const EVENT_ID = '2dae12d9-025f-72cd-a285-87130fd6f63e';
const TENANT_ID = '6e788f7f-c233-4cb8-bbde-c0b855e564be';
const USER_ID = '01a05f6a-5800-7e09-a743-5c1c7b465e5b';

function createService() {
  const prisma = {
    supportConversation: {
      async findFirst({ where }) {
        assert.equal(where.tenantId, TENANT_ID);
        return {
          id: where.id,
          eventId: EVENT_ID,
          guestUserId: 'guest-1',
        };
      },
    },
  };
  const tenantRoutes = {
    matchesEventTenant(eventId, tenantId) {
      return eventId === EVENT_ID && tenantId === TENANT_ID;
    },
    requireEventTenant() {
      throw new Error('internal access must not require a browser tenant context');
    },
  };

  return new ConversationService(
    prisma,
    {},
    {
      async getPermissionsForUser(userId, eventId) {
        assert.equal(userId, USER_ID);
        assert.equal(eventId, EVENT_ID);
        return [EventPermissionKey.ViewSupport];
      },
    },
    {},
    {},
    tenantRoutes,
  );
}

test('internal subscription access validates the trusted tenant route without browser context', async () => {
  const access = await createService().canUserAccessSubscription(
    '32c3d516-e99b-47e3-a152-6f20f2ad7d6d',
    USER_ID,
    TENANT_ID,
  );

  assert.deepEqual(access, { allowed: true, eventId: EVENT_ID });
});

test('internal subscription access remains fail-closed for a foreign tenant', async () => {
  const allowed = await createService().canUserViewEventSupport(
    EVENT_ID,
    USER_ID,
    '7e788f7f-c233-4cb8-bbde-c0b855e564be',
  );

  assert.equal(allowed, false);
});
