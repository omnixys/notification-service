import { env } from '../../config/env.js';
import { ConversationService } from './modules/conversation/conversation.service.js';
import { MessageService } from './modules/message/message.service.js';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '@omnixys/security-ts';
import { isUUID } from 'class-validator';
import { timingSafeEqual } from 'node:crypto';

const { EVENT_TENANT_MAP, INTERNAL_GATEWAY_TOKEN } = env;

@Public()
@Controller('internal/support/access')
export class SupportAccessController {
  constructor(private readonly conversations: ConversationService) {}

  @Get('event')
  async eventAccess(
    @Headers('x-internal-token') token: string | undefined,
    @Query('eventId') eventId: string,
    @Query('userId') userId: string,
    @Query('tenantId') tenantId: string,
  ): Promise<{ eventId: string }> {
    assertInternalToken(token);
    if (
      !eventId ||
      !userId ||
      !isUUID(tenantId) ||
      EVENT_TENANT_MAP[eventId] !== tenantId ||
      !(await this.conversations.canUserViewEventSupport(eventId, userId, tenantId))
    ) {
      throw new ForbiddenException({ code: 'SUPPORT_ACCESS_DENIED' });
    }
    return { eventId };
  }

  @Get('conversation')
  async conversationAccess(
    @Headers('x-internal-token') token: string | undefined,
    @Query('conversationId') conversationId: string,
    @Query('userId') userId: string,
    @Query('tenantId') tenantId: string,
  ): Promise<{ conversationId: string; eventId: string }> {
    assertInternalToken(token);
    if (!isUUID(tenantId)) {
      throw new ForbiddenException({ code: 'SUPPORT_ACCESS_DENIED' });
    }
    const access = await this.conversations.canUserAccessSubscription(
      conversationId,
      userId,
      tenantId,
    );
    if (!access.eventId) {
      throw new NotFoundException({ code: 'SUPPORT_CONVERSATION_NOT_FOUND' });
    }
    if (!access.allowed) {
      throw new ForbiddenException({ code: 'SUPPORT_ACCESS_DENIED' });
    }
    return { conversationId, eventId: access.eventId };
  }
}

@Public()
@Controller('internal/support')
export class SupportInboundController {
  constructor(private readonly messages: MessageService) {}

  @Post('inbound-message')
  async inboundMessage(
    @Headers('x-internal-token') token: string | undefined,
    @Body()
    body: {
      externalId: string;
      tenantId: string;
      eventId: string;
      from: string;
      senderName?: string;
      body?: string;
      mediaUrl?: string;
      mimeType?: string;
    },
  ): Promise<{ conversationId: string; messageId: string; duplicate: boolean }> {
    assertInternalToken(token);
    if (
      !body.externalId ||
      !isUUID(body.tenantId) ||
      !isUUID(body.eventId) ||
      !body.from ||
      (!body.body?.trim() && !body.mediaUrl)
    ) {
      throw new BadRequestException({ code: 'SUPPORT_INBOUND_INVALID' });
    }
    if (EVENT_TENANT_MAP[body.eventId] !== body.tenantId) {
      throw new ForbiddenException({ code: 'SUPPORT_INBOUND_TENANT_ROUTE_INVALID' });
    }
    const existing = await this.messages.findInboundMessage(
      body.externalId,
      body.from,
      body.eventId,
      body.tenantId,
    );
    if (existing) {
      return {
        conversationId: existing.conversationId,
        messageId: existing.id,
        duplicate: true,
      };
    }
    let message;
    try {
      message = await this.messages.receiveInboundMessage(body);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const winner = await this.messages.findInboundMessage(
        body.externalId,
        body.from,
        body.eventId,
        body.tenantId,
      );
      if (!winner) {
        throw error;
      }
      return {
        conversationId: winner.conversationId,
        messageId: winner.id,
        duplicate: true,
      };
    }
    if (!message) {
      throw new NotFoundException({ code: 'SUPPORT_INBOUND_UNMATCHED' });
    }
    return { conversationId: message.conversationId, messageId: message.id, duplicate: false };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function assertInternalToken(candidate: string | undefined): void {
  if (!candidate) {
    throw new ForbiddenException({ code: 'INTERNAL_TOKEN_INVALID' });
  }
  const expected = Buffer.from(INTERNAL_GATEWAY_TOKEN);
  const actual = Buffer.from(candidate);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ForbiddenException({ code: 'INTERNAL_TOKEN_INVALID' });
  }
}
