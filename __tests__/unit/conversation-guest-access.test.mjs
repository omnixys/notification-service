import { strict as assert } from 'node:assert';
import test from 'node:test';

const EVENT_ID = '2dae12d9-025f-72cd-a285-87130fd6f63e';
const USER_ID = '01a0be87-2742-717c-8b68-e573f807a633';

function makeFakeValkey() {
  const published = [];
  return {
    published,
    publish: async (channel, payload) => {
      published.push({ channel, payload });
    },
  };
}

function makeFakePrisma(store) {
  const s = {
    conversations: [],
    messages: [],
    ...store,
  };
  return {
    eventAccessProjection: {
      findUnique: async (args) =>
        s.eventAccess !== undefined
          ? (s.eventAccess.find(
              (entry) =>
                entry.eventId === args.where.uq_event_access_projection.eventId &&
                entry.userId === args.where.uq_event_access_projection.userId,
            ) ?? null)
          : null,
    },
    supportConversation: {
      findFirst: async () => null,
      create: async (args) => {
        const c = {
          id: `conv-${s.conversations.length + 1}`,
          eventId: args.data.eventId,
          invitationId: args.data.invitationId ?? null,
          guestUserId: args.data.guestUserId ?? null,
          guestName: args.data.guestName,
          guestContact: args.data.guestContact ?? null,
          channel: args.data.channel,
          status: 'OPEN',
          subject: args.data.subject ?? null,
          priority: args.data.priority ?? 'NORMAL',
          lastMessagePreview: args.data.lastMessagePreview ?? null,
          lastMessageAt: args.data.lastMessageAt ?? new Date(),
          unreadCount: args.data.unreadCount ?? 0,
          guestUnreadCount: args.data.guestUnreadCount ?? 0,
        };
        s.conversations.push(c);
        return c;
      },
    },
    supportMessage: {
      create: async (args) => {
        s.messages.push(args.data);
        return { id: `msg-${s.messages.length}`, ...args.data };
      },
    },
  };
}

function makeInvitationClient(behavior) {
  const calls = [];
  return {
    calls,
    closed: {
      resolveByUser: async (eventId, userId) => {
        calls.push({ eventId, userId });
        throw behavior;
      },
    },
    open: {
      resolveByUser: async (eventId, userId) => {
        calls.push({ eventId, userId });
        return {
          invitationId: 'inv-1',
          eventId,
          guestName: 'Ada Guest',
          guestContact: 'ada@example.com',
        };
      },
    },
  };
}

async function createService(prisma, valkey, invitationClient) {
  const { ConversationService } = await import(
    '../../dist/modules/support/modules/conversation/conversation.service.js'
  );
  return new ConversationService(
    prisma,
    valkey,
    { getPermissionsForUser: async () => [] },
    undefined,
    invitationClient,
  );
}

const GUEST = {
  id: USER_ID,
  username: 'gyca1042',
  firstName: 'Caleb',
  lastName: 'Gyamfi',
  email: 'gyca1042@omnixys.com',
};

test('fast path: existing projection authorizes without calling the invitation service', async () => {
  const store = { eventAccess: [{ id: 'access-1', eventId: EVENT_ID, userId: USER_ID }] };
  const client = makeInvitationClient(new Error('must not be called'));
  const svc = await createService(makeFakePrisma(store), makeFakeValkey(), client.open);

  const conversation = await svc.createForAuthenticatedGuest(
    EVENT_ID,
    GUEST,
    { channel: 'WEBCHAT', firstMessage: 'Help' },
  );

  assert.equal(conversation.guestUserId, USER_ID);
  assert.equal(conversation.guestName, 'Caleb Gyamfi');
  assert.equal(client.calls.length, 0, 'invitation service must not be consulted');
});

test('fallback: missing projection authorizes via a valid invitation synchronously', async () => {
  const client = makeInvitationClient(new Error('n/a'));
  const svc = await createService(
    makeFakePrisma({ eventAccess: [] }),
    makeFakeValkey(),
    client.open,
  );

  const conversation = await svc.createForAuthenticatedGuest(
    EVENT_ID,
    GUEST,
    { channel: 'WEBCHAT', firstMessage: 'Help' },
  );

  assert.deepEqual(client.calls, [{ eventId: EVENT_ID, userId: USER_ID }]);
  assert.equal(conversation.guestUserId, USER_ID);
  assert.equal(conversation.status, 'OPEN');
});

test('fallback: rejected invitation fails closed with access denied and creates no conversation', async () => {
  const { InvitationSupportValidationException } = await import(
    '../../dist/modules/support/rsvp/invitation-support-client.service.js'
  );
  const store = { eventAccess: [], conversations: [], messages: [] };
  const client = makeInvitationClient(
    new InvitationSupportValidationException('SUPPORT_CONTEXT_INVITATION_NOT_FOUND', 'nope'),
  );
  const svc = await createService(makeFakePrisma(store), makeFakeValkey(), client.closed);

  await assert.rejects(
    svc.createForAuthenticatedGuest(
      EVENT_ID,
      GUEST,
      { channel: 'WEBCHAT', firstMessage: 'Help' },
    ),
    /access denied/i,
  );
  assert.deepEqual(client.calls, [{ eventId: EVENT_ID, userId: USER_ID }]);
  assert.equal(store.conversations.length, 0, 'no conversation may be created');
});

test('fallback: unexpected invitation-service failures still propagate', async () => {
  const client = makeInvitationClient(new Error('invitation service unreachable'));
  const svc = await createService(
    makeFakePrisma({ eventAccess: [] }),
    makeFakeValkey(),
    client.closed,
  );

  await assert.rejects(
    svc.createForAuthenticatedGuest(
      EVENT_ID,
      GUEST,
      { channel: 'WEBCHAT', firstMessage: 'Help' },
    ),
    /invitation service unreachable/i,
  );
});