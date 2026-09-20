import { env } from '../../../config/env.js';
import { Injectable } from '@nestjs/common';
import { OmnixysLogger, type ScopedLogger } from '@omnixys/logger-ts';
import axios, { isAxiosError } from 'axios';

const { INVITATION_URI, INTERNAL_GATEWAY_TOKEN } = env;

export interface InvitationSupportContext {
  invitationId: string;
  eventId: string;
  guestName: string;
  guestContact: string | null;
}

export class InvitationSupportValidationException extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InvitationSupportValidationException';
  }
}

/**
 * Validates an RSVP invitation against the invitation-service's internal
 * support-context endpoint. The invitation id is treated as a capability: every
 * call is re-validated server-side and fails closed on invalid/expired/declined
 * invitations. No guest contact is trusted from the client.
 */
@Injectable()
export class InvitationSupportClientService {
  private readonly logger: ScopedLogger;
  private readonly baseUrl: string;

  constructor(omnixysLogger: OmnixysLogger) {
    this.logger = omnixysLogger.log(InvitationSupportClientService.name, 'service:notification');
    this.baseUrl = INVITATION_URI;
  }

  async resolve(invitationId: string): Promise<InvitationSupportContext> {
    return this.request('/internal/rsvp-support/context', { invitationId });
  }

  /**
   * Resolves whether an authenticated guest user currently holds a valid
   * support invitation for the given event. Used as a synchronous fallback
   * when the asynchronously-populated event-access projection is not yet
   * available (e.g. immediately after access is granted).
   */
  async resolveByUser(eventId: string, userId: string): Promise<InvitationSupportContext> {
    return this.request('/internal/rsvp-support/access', { eventId, userId });
  }

  private async request(
    path: string,
    params: Record<string, string>,
  ): Promise<InvitationSupportContext> {
    const url = `${this.baseUrl}${path}`;
    try {
      const response = await axios.get<InvitationSupportContext>(url, {
        params,
        timeout: 10_000,
        headers: {
          'x-internal-token': INTERNAL_GATEWAY_TOKEN,
        },
        validateStatus: (status) => status < 500,
      });

      if (response.status >= 400) {
        const payload = response.data as { code?: string; message?: string } | undefined;
        const code = payload?.code ?? `HTTP_${response.status}`;
        this.logger.warn(
          'Invitation support access rejected: params=%j status=%s code=%s',
          params,
          response.status,
          code,
        );
        throw new InvitationSupportValidationException(
          code,
          payload?.message ?? 'Invitation is not valid for support',
        );
      }

      return response.data;
    } catch (error) {
      if (error instanceof InvitationSupportValidationException) {
        throw error;
      }
      if (isAxiosError(error)) {
        const code =
          error.response?.status !== undefined && error.response.status >= 500
            ? 'SUPPORT_CONTEXT_UNAVAILABLE'
            : 'SUPPORT_CONTEXT_LOOKUP_FAILED';
        this.logger.error(
          'Invitation support context lookup failed: %s code=%s',
          error.message,
          code,
        );
        throw new InvitationSupportValidationException(code, 'Invitation could not be validated');
      }
      throw error;
    }
  }
}
