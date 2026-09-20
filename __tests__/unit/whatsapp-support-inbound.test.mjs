import assert from 'node:assert/strict';
import test from 'node:test';

import { KafkaTopics } from '@omnixys/kafka-ts';
import { MappingService } from '../../dist/modules/support/modules/mapping/mapping.service.js';
import { MessageService } from '../../dist/modules/support/modules/message/message.service.js';

const EVENT_ID = '2dae12d9-025f-72cd-a285-87130fd6f63e';
const TENANT_ID = '6e788f7f-c233-4cb8-bbde-c0b855e564be';

const logger = {
  log() {
    return { debug() {}, info() {}, warn() {}, error() {} };
  },
};

test('new WhatsApp contact creates the configured event conversation and first message', async () => {
  const kafkaEvents = [];
  const realtimeEvents = [];
  const mappingCreates = [];
  const conversation = {
    id: 'conversation-new',
    eventId: EVENT_ID,
    invitationId: null,
    guestUserId: null,
    guestName: 'WhatsApp Guest',
    guestContact: '+4915226049639',
    channel: 'WHATSAPP',
    status: 'OPEN',
    deletedAt: null,
    unreadCount: 1,
    guestUnreadCount: 0,
  };
  const message = {
    id: 'message-new',
    conversationId: conversation.id,
    direction: 'INBOUND',
    channel: 'WHATSAPP',
    fromUserId: null,
    fromGuest: true,
    body: 'Neue Anfrage',
    mediaUrl: null,
    mimeType: null,
    status: 'DELIVERED',
    externalId: 'evolution-message-new',
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    deliveredAt: null,
    readAt: null,
  };
  const tx = {
    supportConversation: {
      async create({ data }) {
        assert.equal(data.eventId, EVENT_ID);
        assert.equal(data.guestContact, '+4915226049639');
        assert.equal(data.guestName, 'WhatsApp Guest');
        return conversation;
      },
    },
    conversationMapping: {
      async create({ data }) {
        mappingCreates.push(data);
        return data;
      },
    },
    supportMessage: {
      async create({ data }) {
        assert.equal(data.externalId, message.externalId);
        return message;
      },
    },
  };
  const service = new MessageService(
    {
      eventAccessProjection: { async findMany() { return []; } },
      async $transaction(operation) { return operation(tx); },
    },
    {},
    { async send(event) { kafkaEvents.push(event); } },
    { async publish(topic, payload) { realtimeEvents.push({ topic, payload }); } },
    {},
    { async resolveUniqueInboundMapping() {
      return { conversationId: null, eventId: null, created: false };
    } },
    logger,
    {
      requireEventTenant: () => TENANT_ID,
      requireCurrentTenant: () => TENANT_ID,
    },
  );

  const result = await service.receiveInboundMessage({
    externalId: message.externalId,
    eventId: EVENT_ID,
    tenantId: TENANT_ID,
    from: '49 1522 6049639@s.whatsapp.net',
    senderName: 'WhatsApp Guest',
    body: message.body,
  });

  assert.equal(result.id, message.id);
  assert.deepEqual(mappingCreates[0], {
    channel: 'WHATSAPP',
    externalId: '+4915226049639',
    eventId: EVENT_ID,
    tenantId: TENANT_ID,
    conversationId: conversation.id,
    mappingType: 'AUTO',
    provider: 'EVOLUTION',
  });
  assert.equal(kafkaEvents.length, 1);
  assert.equal(kafkaEvents[0].topic, KafkaTopics.conversation.guestReplied);
  assert.equal(realtimeEvents.length, 1);
  assert.equal(realtimeEvents[0].topic, `support.event.conversations.${EVENT_ID}`);
});

test('WhatsApp mapping is restricted to the configured event', async () => {
  const queries = [];
  const prisma = {
    conversationMapping: {
      async findMany({ where }) {
        queries.push(where);
        return [];
      },
      async upsert() {},
    },
    supportConversation: {
      async findMany({ where }) {
        assert.equal(where.eventId, EVENT_ID);
        return [];
      },
    },
  };
  const mappings = new MappingService(prisma);

  const result = await mappings.resolveUniqueInboundMapping(
    'WHATSAPP',
    '4915226049639@s.whatsapp.net',
    EVENT_ID,
    TENANT_ID,
  );

  assert.equal(result.conversationId, null);
  assert.deepEqual(queries[0], {
    channel: 'WHATSAPP',
    externalId: '+4915226049639',
    eventId: EVENT_ID,
    tenantId: TENANT_ID,
  });
});
