import { strict as assert } from 'node:assert';
import test from 'node:test';

const EVENT_ID = 'event-omnixys-2026';
const INVITATION_ID = 'inv-12345';

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
  const s = store ?? { conversations: [], messages: [] };
  const uid = (() => {
    let n = 0;
    return () => `id-${++n}`;
  })();

  return {
    eventAccessProjection: {
      findUnique: async (args) =>
        s.eventAccess?.find(
          (entry) =>
            entry.eventId === args.where.uq_event_access_projection.eventId &&
            entry.userId === args.where.uq_event_access_projection.userId,
        ) ?? null,
    },
    supportConversation: {
      create: async (args) => {
        const c = {
          id: uid(),
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
          createdAt: new Date(),
        };
        s.conversations.push(c);
        return c;
      },
      findFirst: async (args) => {
        return (
          s.conversations.find((c) => {
            if (args.where?.eventId && c.eventId !== args.where.eventId) return false;
            if (args.where?.invitationId !== undefined) {
              if (c.invitationId !== args.where.invitationId) return false;
            }
            if (args.where?.guestUserId !== undefined) {
              if (c.guestUserId !== args.where.guestUserId) return false;
            }
            if (args.where?.status) {
              const st = args.where.status;
              if (st.not && c.status === st.not) return false;
              if (typeof st === 'string' && c.status !== st) return false;
            }
            return true;
          }) ?? null
        );
      },
      findUnique: async (args) => {
        return s.conversations.find((c) => c.id === args.where.id) ?? null;
      },
      update: async (args) => {
        const idx = s.conversations.findIndex((c) => c.id === args.where.id);
        if (idx === -1) throw new Error('conversation not found');
        const current = s.conversations[idx];
        const next = { ...current, ...args.data };
        for (const key of ['unreadCount', 'guestUnreadCount']) {
          const value = args.data[key];
          if (value && typeof value === 'object' && 'increment' in value) {
            next[key] = (current[key] ?? 0) + value.increment;
          }
        }
        s.conversations[idx] = next;
        return s.conversations[idx];
      },
    },
    supportMessage: {
      create: async (args) => {
        const m = {
          id: uid(),
          conversationId: args.data.conversationId,
          direction: args.data.direction,
          channel: args.data.channel,
          fromUserId: args.data.fromUserId ?? null,
          fromGuest: args.data.fromGuest ?? false,
          body: args.data.body ?? null,
          mediaUrl: args.data.mediaUrl ?? null,
          mimeType: args.data.mimeType ?? null,
          status: args.data.status ?? 'SENT',
          createdAt: new Date(),
          deletedAt: null,
        };
        s.messages.push(m);
        return m;
      },
      findMany: async (args) => {
        return s.messages
          .filter((m) => m.conversationId === args.where?.conversationId)
          .sort((a, b) => a.createdAt - b.createdAt)
          .slice(0, args.take ?? Infinity);
      },
    },
    $transaction: async (ops) => Promise.all(ops),
  };
}

// =========================================================================
//  SupportRsvpService orchestration (stubbed collaborators)
// =========================================================================

async function makeStubbedRsvpService({ context, deps }) {
  const invitationClient = {
    resolve: async (invitationId) => {
      assert.equal(invitationId, INVITATION_ID, 'resolve must receive the invocation id');
      return context;
    },
  };

  const conversationService = {
    findByInvitation: async (eventId, invitationId) =>
      deps.findByInvitation ? deps.findByInvitation(eventId, invitationId) : null,
    createForInvitation: async (eventId, data) =>
      deps.createForInvitation ? deps.createForInvitation(eventId, data) : {},
    markAsReadByInvitation: async (eventId, invitationId) =>
      deps.markAsReadByInvitation ? deps.markAsReadByInvitation(eventId, invitationId) : {},
  };

  const messageService = {
    getMessagesByInvitation: async (eventId, invitationId, limit) =>
      deps.getMessagesByInvitation
        ? deps.getMessagesByInvitation(eventId, invitationId, limit)
        : [],
    sendMessageByInvitation: async (eventId, invitationId, data) =>
      deps.sendMessageByInvitation
        ? deps.sendMessageByInvitation(eventId, invitationId, data)
        : {},
  };

  // Runtime: constructor args are positional; pass stub objects.
  const { SupportRsvpService } = await import(
    '../../dist/modules/support/rsvp/support-rsvp.service.js'
  );
  const svc = new SupportRsvpService(invitationClient, conversationService, messageService);
  return { svc };
}

test('SupportRsvpService.conversation – is read-only and returns no conversation before first send', async () => {
  const context = {
    invitationId: INVITATION_ID,
    eventId: EVENT_ID,
    guestName: 'Resolved Guest',
    guestContact: 'resolved@example.com',
  };
  let lookupArgs = null;
  const { svc } = await makeStubbedRsvpService({
    context,
    deps: {
      findByInvitation: async (eventId, invitationId) => {
        lookupArgs = { eventId, invitationId };
        return null;
      },
    },
  });

  const result = await svc.conversation(INVITATION_ID);

  assert.deepEqual(lookupArgs, { eventId: EVENT_ID, invitationId: INVITATION_ID });
  assert.equal(result.conversation, null);
  assert.deepEqual(result.messages, []);
});

test('SupportRsvpService.sendMessage – rejects a body-less message without media', async () => {
  const { svc } = await makeStubbedRsvpService({
    context: { invitationId: INVITATION_ID, eventId: EVENT_ID, guestName: 'G' },
    deps: {},
  });

  await assert.rejects(
    svc.sendMessage(INVITATION_ID, '   ', undefined),
    /body or media is required/i,
  );
  await assert.rejects(
    svc.sendMessage(INVITATION_ID, undefined, undefined),
    /body or media is required/i,
  );
});

test('SupportRsvpService.sendMessage – forwards validated eventId to message service', async () => {
  const context = { invitationId: INVITATION_ID, eventId: EVENT_ID, guestName: 'G' };
  let sendArgs = null;
  const { svc } = await makeStubbedRsvpService({
    context,
    deps: {
      findByInvitation: async () => ({ id: 'conv-1' }),
      sendMessageByInvitation: async (eventId, invitationId, data) => {
        sendArgs = { eventId, invitationId, data };
        return { id: 'm1' };
      },
    },
  });

  const result = await svc.sendMessage(INVITATION_ID, 'Hi', 'http://media/x.png');
  assert.ok(sendArgs);
  assert.equal(sendArgs.eventId, EVENT_ID);
  assert.equal(sendArgs.invitationId, INVITATION_ID);
  assert.equal(sendArgs.data.body, 'Hi');
  assert.equal(sendArgs.data.mediaUrl, 'http://media/x.png');
  assert.equal(result.id, 'm1');
});

test('SupportRsvpService.sendMessage – creates the conversation only on the first message', async () => {
  let createArgs = null;
  const { svc } = await makeStubbedRsvpService({
    context: {
      invitationId: INVITATION_ID,
      eventId: EVENT_ID,
      guestName: 'Resolved Guest',
      guestContact: 'resolved@example.com',
    },
    deps: {
      findByInvitation: async () => null,
      createForInvitation: async (eventId, data) => {
        createArgs = { eventId, data };
        return { id: 'conv-new' };
      },
      getMessagesByInvitation: async () => [{ id: 'first-message' }],
    },
  });

  const result = await svc.sendMessage(INVITATION_ID, 'First hello');

  assert.equal(result.id, 'first-message');
  assert.equal(createArgs.eventId, EVENT_ID);
  assert.equal(createArgs.data.invitationId, INVITATION_ID);
  assert.equal(createArgs.data.guestName, 'Resolved Guest');
  assert.equal(createArgs.data.firstMessage, 'First hello');
});

test('SupportRsvpService.messages – resolves invitation then delegates limit', async () => {
  let limitSeen = null;
  const { svc } = await makeStubbedRsvpService({
    context: { invitationId: INVITATION_ID, eventId: EVENT_ID, guestName: 'G' },
    deps: {
      findByInvitation: async () => ({ id: 'conv-1' }),
      getMessagesByInvitation: async (_e, _i, limit) => {
        limitSeen = limit;
        return ['a', 'b'];
      },
    },
  });

  const result = await svc.messages(INVITATION_ID, 50);
  assert.equal(limitSeen, 50);
  assert.equal(result.length, 2);
});

test('SupportRsvpService.messages – returns an empty history without creating a conversation', async () => {
  let messagesRequested = false;
  const { svc } = await makeStubbedRsvpService({
    context: { invitationId: INVITATION_ID, eventId: EVENT_ID, guestName: 'G' },
    deps: {
      findByInvitation: async () => null,
      getMessagesByInvitation: async () => {
        messagesRequested = true;
        return [];
      },
    },
  });

  const result = await svc.messages(INVITATION_ID, 50);

  assert.deepEqual(result, []);
  assert.equal(messagesRequested, false);
});

test('SupportRsvpService.markAsRead – delegates to conversation service by invitation', async () => {
  let marked = null;
  const { svc } = await makeStubbedRsvpService({
    context: { invitationId: INVITATION_ID, eventId: EVENT_ID, guestName: 'G' },
    deps: {
      markAsReadByInvitation: async (eventId, invitationId) => {
        marked = { eventId, invitationId };
        return { id: 'conv-1' };
      },
    },
  });

  await svc.markAsRead(INVITATION_ID);
  assert.ok(marked);
  assert.equal(marked.eventId, EVENT_ID);
  assert.equal(marked.invitationId, INVITATION_ID);
});

// =========================================================================
//  ConversationService.createForInvitation (reuse + publish)
// =========================================================================

async function createConversationService(store, valkey) {
  const [{ ConversationService }, { InvitationSupportValidationException }] = await Promise.all([
    import('../../dist/modules/support/modules/conversation/conversation.service.js'),
    import('../../dist/modules/support/rsvp/invitation-support-client.service.js'),
  ]);
  const prisma = makeFakePrisma(store);
  const svc = new ConversationService(
    prisma,
    valkey,
    {
      getPermissionsForUser: async () => [],
    },
    undefined,
    {
      resolveByUser: async () => {
        throw new InvitationSupportValidationException('NO_MATCH', 'no invitation for user');
      },
    },
  );
  return svc;
}

test('createForInvitation – reuses an existing open conversation for (eventId, invitationId)', async () => {
  const store = {
    conversations: [
      {
        id: 'existing-1',
        eventId: EVENT_ID,
        invitationId: INVITATION_ID,
        status: 'OPEN',
        channel: 'WEBCHAT',
        guestName: 'Existing Guest',
        createdAt: new Date(),
      },
    ],
    messages: [],
  };
  const valkey = makeFakeValkey();
  const svc = await createConversationService(store, valkey);

  const result = await svc.createForInvitation(EVENT_ID, {
    invitationId: INVITATION_ID,
    guestName: 'New Guest',
    channel: 'WEBCHAT',
    firstMessage: 'Hello again',
  });

  assert.equal(result.id, 'existing-1', 'must reuse open conversation');
  assert.equal(store.conversations.length, 1, 'must not create a duplicate');
  assert.equal(valkey.published.some((p) => p.channel.includes('created')), false);
});

test('createForInvitation – creates and publishes created event when none is open', async () => {
  const store = { conversations: [], messages: [] };
  const valkey = makeFakeValkey();
  const svc = await createConversationService(store, valkey);

  const result = await svc.createForInvitation(EVENT_ID, {
    invitationId: INVITATION_ID,
    guestName: 'Guest',
    guestContact: 'guest@example.com',
    channel: 'WEBCHAT',
    firstMessage: 'First hello',
  });

  assert.equal(result.status, 'OPEN');
  assert.equal(store.conversations.length, 1);
  assert.equal(store.messages.length, 1, 'first message must be persisted');

  const created = valkey.published.find((p) =>
    p.channel.includes(`support.event.conversations.${EVENT_ID}`),
  );
  assert.ok(created, 'must publish to event conversation channel');
  assert.equal(created.payload.kind, 'created');
  assert.equal(created.payload.guestName, 'Guest');
  assert.equal(created.payload.channel, 'WEBCHAT');
});

test('createForInvitation – does not reuse a closed conversation (creates a new one)', async () => {
  const store = {
    conversations: [
      {
        id: 'closed-1',
        eventId: EVENT_ID,
        invitationId: INVITATION_ID,
        status: 'CLOSED',
        channel: 'WEBCHAT',
        guestName: 'Old',
        createdAt: new Date(),
      },
    ],
    messages: [],
  };
  const svc = await createConversationService(store, makeFakeValkey());

  const result = await svc.createForInvitation(EVENT_ID, {
    invitationId: INVITATION_ID,
    guestName: 'New',
    channel: 'WEBCHAT',
    firstMessage: 'Hello',
  });

  assert.notEqual(result.id, 'closed-1', 'must not reuse a closed conversation');
  assert.equal(store.conversations.length, 2);
  assert.equal(result.status, 'OPEN');
});

test('createForAuthenticatedGuest – validates event membership and derives guest identity', async () => {
  const store = {
    conversations: [],
    messages: [],
    eventAccess: [{ id: 'access-1', eventId: EVENT_ID, userId: 'guest-user' }],
  };
  const svc = await createConversationService(store, makeFakeValkey());

  const conversation = await svc.createForAuthenticatedGuest(
    EVENT_ID,
    {
      id: 'guest-user',
      username: 'spoof-proof',
      firstName: 'Ada',
      lastName: 'Guest',
      email: 'ada@example.com',
    },
    { channel: 'WEBCHAT', firstMessage: 'Help' },
  );

  assert.equal(conversation.guestUserId, 'guest-user');
  assert.equal(conversation.guestName, 'Ada Guest');
  assert.equal(conversation.guestContact, 'ada@example.com');
  assert.equal(conversation.unreadCount, 1);
});

test('createForAuthenticatedGuest – rejects users without event membership', async () => {
  const svc = await createConversationService(
    { conversations: [], messages: [], eventAccess: [] },
    makeFakeValkey(),
  );

  await assert.rejects(
    svc.createForAuthenticatedGuest(
      EVENT_ID,
      {
        id: 'outsider',
        username: 'outsider',
        firstName: '',
        lastName: '',
        email: '',
      },
      { channel: 'WEBCHAT', firstMessage: 'Help' },
    ),
    /access denied/i,
  );
});

test('markAsRead – guest and staff clear only their own unread counter', async () => {
  const store = {
    conversations: [
      {
        id: 'conv-unread',
        eventId: EVENT_ID,
        guestUserId: 'guest-user',
        invitationId: null,
        status: 'OPEN',
        channel: 'WEBCHAT',
        guestName: 'Guest',
        unreadCount: 3,
        guestUnreadCount: 2,
      },
    ],
    messages: [],
  };
  const prisma = makeFakePrisma(store);
  const { ConversationService } = await import(
    '../../dist/modules/support/modules/conversation/conversation.service.js'
  );
  const svc = new ConversationService(prisma, makeFakeValkey(), {
    getPermissionsForUser: async (userId) =>
      userId === 'staff-user' ? ['support.view'] : [],
  });

  const guestResult = await svc.markAsRead('conv-unread', { id: 'guest-user' });
  assert.equal(guestResult.unreadCount, 3);
  assert.equal(guestResult.guestUnreadCount, 0);

  store.conversations[0].guestUnreadCount = 2;
  const staffResult = await svc.markAsRead('conv-unread', { id: 'staff-user' });
  assert.equal(staffResult.unreadCount, 0);
  assert.equal(staffResult.guestUnreadCount, 2);
});

// =========================================================================
//  MessageService invitation-scoped reads
// =========================================================================

async function createMessageService(store) {
  const { MessageService } = await import(
    '../../dist/modules/support/modules/message/message.service.js'
  );
  const prisma = makeFakePrisma(store);
  const logger = { log: () => ({ debug: () => {}, warn: () => {}, error: () => {} }) };
  const svc = new MessageService(
    prisma,
    {},
    { send: async () => {} },
    makeFakeValkey(),
    {},
    {},
    logger,
  );
  return svc;
}

test('getMessagesByInvitation – returns messages for the resolved conversation only', async () => {
  const store = {
    conversations: [
      {
        id: 'conv-a',
        eventId: EVENT_ID,
        invitationId: INVITATION_ID,
        status: 'OPEN',
        channel: 'WEBCHAT',
        guestName: 'G',
        unreadCount: 0,
        createdAt: new Date(),
      },
      {
        id: 'conv-b',
        eventId: EVENT_ID,
        invitationId: 'other-inv',
        status: 'OPEN',
        channel: 'WEBCHAT',
        guestName: 'G2',
        unreadCount: 0,
        createdAt: new Date(),
      },
    ],
    messages: [
      { conversationId: 'conv-a', body: 'a1' },
      { conversationId: 'conv-a', body: 'a2' },
      { conversationId: 'conv-b', body: 'b1' },
    ],
  };
  const svc = await createMessageService(store);

  const messages = await svc.getMessagesByInvitation(EVENT_ID, INVITATION_ID);
  assert.equal(messages.length, 2, 'must only return messages of the target conversation');
});

test('getMessagesByInvitation – rejects when no conversation exists for the invitation', async () => {
  const svc = await createMessageService({ conversations: [], messages: [] });
  await assert.rejects(
    svc.getMessagesByInvitation(EVENT_ID, 'unknown-inv'),
    (err) => {
      assert.match(err.message, /not found/i);
      return true;
    },
  );
});
