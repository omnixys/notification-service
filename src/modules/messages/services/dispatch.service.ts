import type { GatewaySendInput } from './gateway-client.service.js';
import { GatewayClientService } from './gateway-client.service.js';
import { Injectable } from '@nestjs/common';
import { OmnixysLogger, type ScopedLogger } from '@omnixys/logger-ts';

export interface DispatchInput {
  id: string;
  channel: 'WHATSAPP' | 'EMAIL';
  recipientId?: string;
  recipientAddress: string;
  senderId?: string;
  body: string;
  contentType?: 'TEXT' | 'HTML';
  subject?: string;
  senderAddress?: string;
  metadata?: {
    conversationId?: string;
    tenantId?: string;
  };
}

export interface DispatchResult {
  success: boolean;
  providerMessageId?: string;
  status: 'SENT' | 'PENDING' | 'FAILED';
  error?: string;
}

@Injectable()
export class DispatchService {
  private readonly logger: ScopedLogger;

  constructor(
    private readonly gateway: GatewayClientService,
    omnixysLogger: OmnixysLogger,
  ) {
    this.logger = omnixysLogger.log(DispatchService.name, 'service:notification');
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    this.logger.debug(`Dispatching ${input.channel} message: ${input.id}`);

    const gatewayInput: GatewaySendInput = {
      id: input.id,
      channel: input.channel,
      recipientId: input.recipientId,
      recipientAddress: input.recipientAddress,
      senderId: input.senderId,
      body: input.body,
      contentType: input.contentType ?? 'TEXT',
      subject: input.subject,
      senderAddress: input.senderAddress,
      metadata: input.metadata,
    };

    const result = await this.gateway.send(gatewayInput);

    if (!result.success) {
      this.logger.warn(`Dispatch failed for ${input.id}: ${result.error ?? 'unknown error'}`);
      return {
        success: false,
        status: 'FAILED',
        error: result.error,
      };
    }

    return {
      success: true,
      providerMessageId: result.providerMessageId,
      status: 'SENT',
    };
  }
}
