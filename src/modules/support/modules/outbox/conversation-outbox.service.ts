import type { Prisma } from '../../../../prisma/generated/client.js';
import { Injectable } from '@nestjs/common';
import { ContextAccessor } from '@omnixys/context-ts';
import { randomUUID } from 'node:crypto';

interface ConversationOutboxInput {
  topic: string;
  payload: unknown;
  tenantId: string;
  key?: string;
  actorId?: string;
  type?: 'EVENT' | 'COMMAND';
  operation: string;
}

@Injectable()
export class ConversationOutboxService {
  enqueue(tx: Prisma.TransactionClient, input: ConversationOutboxInput): Promise<unknown> {
    const context = ContextAccessor.get();
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();
    const type = input.type ?? 'EVENT';
    return tx.outboxMessage.create({
      data: {
        id: eventId,
        topic: input.topic,
        key: input.key,
        payload: JSON.parse(
          JSON.stringify({
            eventId,
            eventName: input.topic,
            eventType: type,
            eventVersion: '1',
            service: 'notification',
            timestamp,
            payload: input.payload,
          }),
        ) as Prisma.InputJsonValue,
        headers: {
          'x-meta-service': 'notification',
          'x-meta-version': '1',
          'x-meta-type': type,
          'x-meta-operation': input.operation,
          'x-meta-tenantId': input.tenantId,
          'x-request-id': context?.requestId ?? eventId,
          'x-correlation-id': context?.correlationId ?? context?.requestId ?? eventId,
          ...(input.actorId ? { 'x-meta-actorId': input.actorId } : {}),
        },
      },
    });
  }
}
