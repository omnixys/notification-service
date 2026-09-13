import { env } from '../../../config/env.js';
import {
  Notification,
  NotificationStatus,
  Priority,
  Prisma,
} from '../../../prisma/generated/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DispatchService } from '../../messages/services/dispatch.service.js';
import { AnalyticsOutboxService } from '../../support/modules/outbox/analytics-outbox.service.js';
import {
  NotificationChannelUnavailableException,
  NotificationDeliveryException,
  NotificationInputException,
  NotificationNotFoundException,
  NotificationStateException,
} from '../errors/notification.error.js';
import { GuestMagicLinkMetricsService } from '../metrics/guest-magic-link.metrics.service.js';
import { Channel } from '../models/enums/channel.enum.js';
import { BulkInvitationDTO } from '../models/inputs/send-invitations.input.js';
import { getVerificationChannelLabel } from '../models/mappers/verification-channel-label.mapper.js';
import { AccountCreatedVariables } from '../models/variables/account-create-notification.variables..js';
import { CreateGuestVariables } from '../models/variables/create-guest.variables.js';
import { formatRequestTime } from '../utils/date.util.js';
import { NotificationCacheService } from './notification-cache.service.js';
import { SendInvitationVariables, TemplateRenderService } from './template-renderer.service.js';
import { Injectable, Optional } from '@nestjs/common';
import { ValkeyPubSubService } from '@omnixys/cache-ts';
import { createTmpUsername, getPrimaryPhoneNumber } from '@omnixys/contracts-ts';
import type {
  CreatePendingUserDTO,
  GuestMagicLinkNotificationDTO,
  GuestSignUpTokenPayload,
  Locale,
  SendAuthLinkDTO,
  SignUpTokenPayload,
} from '@omnixys/contracts-ts';
import { CreateUserInput } from '@omnixys/graphql-ts';
import { OmnixysLogger } from '@omnixys/logger-ts';
import { TraceRunner } from '@omnixys/observability-ts';
import { EncryptionService } from '@omnixys/security-ts';
import { InputJsonValue } from '@prisma/client/runtime/client';

const {
  APP_BASE_URL,
  CHECKPOINT_APP_BASE_URL,
  VERIFY_PATH,
  VERIFY_GUEST_PATH,
  MAGIC_PATH,
  CHECKPOINT_MAGIC_PATH,
  RESET_PATH,
  FROM_SUPPORT,
  FROM_NO_REPLY,
  FROM_SENDER_ID,
  DEFAULT_TENANT_ID,
} = env;

interface NotifyUserCreationEvent {
  payload: {
    email?: string;
    phoneNumber?: string;
    username: string;
    locale?: Locale;
  };
}

export interface CreateNotificationDTO {
  tenantId?: string;
  recipientUsername: string;
  recipientId?: string;
  recipientAddress?: string;

  channel: Channel;
  priority?: Priority;

  templateId?: string;

  variables?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;

  sensitive?: boolean;
  expiresAt?: Date;

  createdBy?: string;
  title?: string;
  body?: string;
  contentFormat?: 'TEXT' | 'HTML' | 'MARKDOWN';
  templateVersion?: number;
}

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}

@Injectable()
export class NotificationWriteService {
  private readonly logger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationCacheService: NotificationCacheService,
    private readonly dispatchService: DispatchService,
    private readonly templateRenderService: TemplateRenderService,
    private readonly encryptService: EncryptionService,
    private readonly valkeyPubSub: ValkeyPubSubService,
    loggerService: OmnixysLogger,
    private readonly analyticsOutbox: AnalyticsOutboxService,
    @Optional() private readonly magicLinkMetrics?: GuestMagicLinkMetricsService,
  ) {
    this.logger = loggerService.log(this.constructor.name, 'service:notification');
  }

  // ─────────────────────────────────────────────
  // CREATE (Idempotent optional)
  // ─────────────────────────────────────────────
  async create(input: CreateNotificationDTO): Promise<Notification> {
    this.logger.debug(
      'create notification: channel=%s templateId=%s',
      input.channel,
      input.templateId ?? 'none',
    );

    const notification = await this.prisma.notification.create({
      data: {
        tenantId: input.tenantId ?? null,
        recipientUsername: input.recipientUsername,
        recipientId: input.recipientId ?? null,
        recipientAddress: input.recipientAddress ?? null,

        templateId: input.templateId ?? null,

        channel: input.channel,
        priority: input.priority ?? 'NORMAL',

        variables: input.variables ?? {},
        metadata: input.metadata ?? {},

        sensitive: input.sensitive ?? false,
        expiresAt: input.expiresAt ?? null,

        status: NotificationStatus.PENDING,
        createdBy: input.createdBy && isValidUuidV7(input.createdBy) ? input.createdBy : null,
        title: input.title ?? null,
        body: input.body ?? null,
        contentFormat: input.contentFormat ?? null,
        templateVersion: input.templateVersion ?? null,
      },
    });

    this.logger.debug(
      'create notification completed: notificationId=%s channel=%s',
      notification.id,
      notification.channel,
    );

    return notification;
  }

  async createAndDispatch(
    input: CreateNotificationDTO & { locale?: string },
  ): Promise<Notification> {
    if (!input.templateId) {
      throw new NotificationInputException('template-required');
    }
    if (input.channel === Channel.IN_APP && !input.recipientId) {
      throw new NotificationInputException('recipient-id-missing');
    }
    if (input.channel !== Channel.IN_APP && !input.recipientAddress) {
      throw new NotificationInputException('recipient-address-missing');
    }

    const rendered = await this.templateRenderService.renderFromId({
      templateId: input.templateId,
      channel: input.channel,
      locale: input.locale,
      variables: (input.variables ?? {}) as Record<string, unknown>,
    });
    const notification = await this.create({
      ...input,
      title: rendered.renderedTitle,
      body: rendered.renderedBody,
      contentFormat: input.channel === Channel.EMAIL ? 'HTML' : 'TEXT',
      templateVersion: rendered.version,
    });
    try {
      const providerRef = await this.dispatchNotification({
        channel: input.channel,
        notificationId: notification.id,
        to: input.recipientAddress,
        recipientId: input.recipientId,
        subject: rendered.renderedTitle,
        body: rendered.renderedBody,
        flow: 'generic-notification',
      });
      if (input.channel !== Channel.IN_APP) {
        return this.markAsSent(notification.id, {
          provider: this.resolveProvider(input.channel),
          providerRef,
        });
      }
      return this.findOrThrow(notification.id);
    } catch (error) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          failureReason: this.safeFailureReason(error),
        },
      });
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // MARK AS READ
  // ─────────────────────────────────────────────
  async markAsRead(id: string): Promise<Notification> {
    const existing = await this.findOrThrow(id);

    if (existing.readAt) {
      return existing;
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        readAt: new Date(),
      },
    });
  }

  async markAsReadForUser(id: string, recipientId: string): Promise<Notification> {
    const existing = await this.findOrThrow(id);
    if (existing.recipientId !== recipientId) {
      throw new NotificationNotFoundException(id);
    }
    return this.markAsRead(id);
  }

  // ─────────────────────────────────────────────
  // MARK AS UNREAD
  // ─────────────────────────────────────────────
  async markAsUnread(id: string): Promise<Notification> {
    await this.findOrThrow(id);

    return this.prisma.notification.update({
      where: { id },
      data: {
        readAt: null,
      },
    });
  }

  // ─────────────────────────────────────────────
  // ARCHIVE
  // ─────────────────────────────────────────────
  async archive(id: string): Promise<Notification> {
    const existing = await this.findOrThrow(id);

    if (existing.archivedAt) {
      return existing;
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        status: NotificationStatus.ARCHIVED,
      },
    });
  }

  async archiveForUser(id: string, recipientId: string): Promise<Notification> {
    const existing = await this.findOrThrow(id);
    if (existing.recipientId !== recipientId) {
      throw new NotificationNotFoundException(id);
    }
    return this.archive(id);
  }

  async unarchive(id: string): Promise<Notification> {
    const existing = await this.findOrThrow(id);

    if (!existing.archivedAt) {
      return existing;
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        archivedAt: null,
        status: NotificationStatus.SENT,
      },
    });
  }

  // ─────────────────────────────────────────────
  // CANCEL (only before sent/delivered)
  // ─────────────────────────────────────────────
  async cancel(id: string): Promise<Notification> {
    const existing = await this.findOrThrow(id);

    if (
      existing.status === NotificationStatus.SENT ||
      existing.status === NotificationStatus.DELIVERED
    ) {
      throw new NotificationStateException('cannot-cancel-delivered', undefined, {
        notificationId: id,
        status: existing.status,
      });
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.CANCELLED,
      },
    });
  }

  // ─────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────
  async delete(id: string): Promise<Notification> {
    await this.findOrThrow(id);

    return this.prisma.notification.delete({
      where: { id },
    });
  }

  // ─────────────────────────────────────────────
  // BULK OPERATIONS
  // ─────────────────────────────────────────────
  async markAsReadBulk(ids: string[]): Promise<Prisma.BatchPayload | void> {
    if (!ids.length) {
      return;
    }

    return this.prisma.notification.updateMany({
      where: {
        id: { in: ids },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  async archiveBulk(ids: string[]): Promise<Prisma.BatchPayload | void> {
    if (!ids.length) {
      return;
    }

    return this.prisma.notification.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        archivedAt: new Date(),
        status: NotificationStatus.ARCHIVED,
      },
    });
  }

  async deleteBulk(ids: string[]): Promise<Prisma.BatchPayload | void> {
    if (!ids.length) {
      return;
    }

    return this.prisma.notification.deleteMany({
      where: {
        id: { in: ids },
      },
    });
  }

  // ─────────────────────────────────────────────
  // INTERNAL HELPER
  // ─────────────────────────────────────────────

  private async findOrThrow(id: string): Promise<Notification> {
    const entity = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!entity) {
      throw new NotificationNotFoundException(id);
    }

    return entity;
  }

  // ─────────────────────────────────────────────
  // MARK AS SENT
  // ─────────────────────────────────────────────
  async markAsSent(
    id: string,
    options?: {
      provider?: string;
      providerRef?: string;
    },
  ): Promise<Notification> {
    const existing = await this.findOrThrow(id);

    // State validation
    if (
      existing.status !== NotificationStatus.PENDING &&
      existing.status !== NotificationStatus.PROCESSING
    ) {
      throw new NotificationStateException('cannot-mark-sent', undefined, {
        notificationId: id,
        status: existing.status,
      });
    }

    this.logger.debug('markAsSent update started: notificationId=%s', id);
    const notification = await this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.SENT,
        provider: options?.provider ?? existing.provider ?? null,
        providerRef: options?.providerRef ?? existing.providerRef ?? null,
      },
    });

    this.logger.info(
      'markAsSent update completed: notificationId=%s provider=%s',
      id,
      notification.provider ?? 'unknown',
    );

    return notification;
  }

  async createSignupVerification({
    createUserInput,
    locale,
  }: {
    createUserInput: CreateUserInput;
    locale: Locale;
  }): Promise<string> {
    return TraceRunner.run('Create SignUp Verification', async () => {
      this.logger.debug(
        'createSignupVerification processing started: username=%s locale=%s',
        createUserInput.username,
        locale,
      );

      // 1️⃣ Store payload in Valkey
      this.logger.debug(
        'createSignupVerification payload storage started: username=%s',
        createUserInput.username,
      );
      const signUpTokens: SignUpTokenPayload =
        await this.notificationCacheService.storeSignupVerificationPayload(
          createUserInput,
          {},
          60 * 15,
        );
      this.logger.debug(
        'createSignupVerification payload stored: username=%s',
        createUserInput.username,
      );

      const payload = {
        ...signUpTokens,
        timestamp: Date.now(),
      };

      const verificationId = this.encryptService.encrypt(JSON.stringify(payload), true);

      const verifyUrl = `${APP_BASE_URL}${VERIFY_PATH}?token=${verificationId}`;
      this.logger.debug(
        'createSignupVerification link created: username=%s',
        createUserInput.username,
      );

      // 2️⃣ Render Template
      const { templateId, renderedTitle, renderedBody } =
        await this.templateRenderService.renderFromKey({
          templateKey: 'auth.sign-up-verification.request',
          channel: Channel.EMAIL,
          locale,
          variables: {
            firstName: createUserInput.personalInfo.firstName,
            lastName: createUserInput.personalInfo.lastName,
            actionUrl: verifyUrl,
            expiresInMinutes: 15,
          },
        });

      // 3️⃣ Persist Notification FIRST
      const notification = await this.create({
        tenantId: DEFAULT_TENANT_ID,
        recipientUsername: createUserInput.username,
        recipientAddress: createUserInput.personalInfo.email,
        channel: Channel.EMAIL,
        priority: Priority.NORMAL,
        templateId,
        variables: {
          firstName: createUserInput.personalInfo.firstName,
          lastName: createUserInput.personalInfo.lastName,
          username: createUserInput.username,
          actionUrl: verifyUrl,
          expiresInMinutes: 15,
        },
        metadata: {
          flow: 'signup-verification',
        },
        sensitive: false,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdBy: '2bd07be1-88b4-7a13-b797-b00e417c6102',
      });

      // 4️⃣ Dispatch
      await this.dispatchNotification({
        channel: Channel.EMAIL,
        notificationId: notification.id,
        to: createUserInput.personalInfo.email,
        subject: renderedTitle ?? '',
        body: renderedBody,
        flow: 'signup-verification',
      });
      this.logger.debug(
        'createSignupVerification dispatch completed: notificationId=%s',
        notification.id,
      );

      // 5️⃣ Mark as sent
      await this.markAsSent(notification.id, {
        provider: this.resolveProvider(Channel.EMAIL),
      });

      this.logger.info(
        'createSignupVerification processing completed: notificationId=%s username=%s',
        notification.id,
        createUserInput.username,
      );

      return verificationId;
    });
  }

  async confirmGuest({
    input,
    eventName,
    seat,
    eventEndsAt,
  }: {
    input: CreatePendingUserDTO;
    eventName: string;
    seat?: string;
    eventEndsAt: Date;
  }): Promise<void> {
    return TraceRunner.run('Create Guest SignUp Verification', async () => {
      this.logger.debug(
        'confirmGuest notification processing started: eventName=%s channel=pending',
        eventName,
      );

      const finalInput = { ...input, eventEndsAt };
      // 1️⃣ Store payload in Valkey
      this.logger.debug(
        'confirmGuest verification payload storage started: eventName=%s',
        eventName,
      );
      const guestSignUpTokens: GuestSignUpTokenPayload =
        await this.notificationCacheService.storeGuestVerificationPayload(finalInput, 60 * 15);
      this.logger.debug('confirmGuest verification payload stored: eventName=%s', eventName);

      const payload = {
        ...guestSignUpTokens,
        timestamp: Date.now(),
      };

      const verificationId = this.encryptService.encrypt(JSON.stringify(payload), true);

      const verifyUrl = `${APP_BASE_URL}${VERIFY_GUEST_PATH}?token=${verificationId}`;
      this.logger.debug('confirmGuest verification link created: eventName=%s', eventName);

      const phoneNumber = getPrimaryPhoneNumber(input.phoneNumbers);

      const channel = this.resolveChannel({
        email: input.email,
        phoneNumber,
      });

      const verificationChannelLabel = getVerificationChannelLabel(channel, input.locale);

      const variables: CreateGuestVariables = {
        firstName: input.firstName,
        eventName,
        lastName: input.lastName,
        actionUrl: verifyUrl,
        seat,
        expiresInMinutes: 15,
        supportEmail: 'support@omnixys.com',
        hostName: 'Caleb',
        supportPhone: '1234567890',
        verificationChannel: verificationChannelLabel,
      };

      const { templateId, renderedTitle, renderedBody } =
        await this.templateRenderService.renderFromKey({
          templateKey: 'guest.account.created',
          channel,
          locale: input.locale,
          variables,
        });

      const notification = await this.create({
        tenantId: DEFAULT_TENANT_ID,
        recipientUsername: createTmpUsername(input.lastName, input.firstName),
        recipientAddress: input.email ?? phoneNumber ?? 'unknown',
        channel,
        priority: Priority.NORMAL,
        templateId,
        variables: variables as unknown as InputJsonValue,
        metadata: {
          flow: 'guest-verification',
        },
        sensitive: false,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdBy: '2bd07be1-88b4-7a13-b797-b00e417c6102',
      });

      /**
       * 5️⃣ Dispatch via Channel Adapter
       */
      try {
        await this.dispatchNotification({
          channel,
          notificationId: notification.id,
          to: input.email ?? phoneNumber,
          subject: renderedTitle ?? '',
          body: renderedBody,
          flow: 'guest-verification',
        });

        /**
         * 6️⃣ Mark as sent (only if dispatch succeeded)
         */
        await this.markAsSent(notification.id, {
          provider: this.resolveProvider(channel),
        });

        this.logger.info(
          'confirmGuest notification processing completed: notificationId=%s eventName=%s channel=%s',
          notification.id,
          eventName,
          channel,
        );
      } catch (error: unknown) {
        this.logger.error(
          'confirmGuest dispatch failed: notificationId=%s eventName=%s channel=%s error=%s',
          notification.id,
          eventName,
          channel,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    });
  }

  async sendMagicLink({
    token,
    email,
    locale,
    username,
    device,
    ip,
    location,
  }: SendAuthLinkDTO): Promise<void> {
    this.logger.debug('sendMagicLink processing started: username=%s locale=%s', username, locale);

    try {
      const magicLink = `${APP_BASE_URL}${MAGIC_PATH}?token=${encodeURIComponent(token)}`;
      this.logger.debug('sendMagicLink link created: username=%s', username);

      const { templateId, renderedTitle, renderedBody } =
        await this.templateRenderService.renderFromKey({
          templateKey: 'auth.magic-link.request',
          channel: Channel.EMAIL,
          locale,
          variables: {
            username,
            actionUrl: magicLink,
            expiresInMinutes: 5,
            ip,
            device,
            location,
            requestTime: formatRequestTime(locale),
            supportEmail: FROM_SUPPORT,
          },
        });

      const notification = await this.create({
        tenantId: DEFAULT_TENANT_ID,
        recipientUsername: username,
        recipientAddress: email,
        channel: Channel.EMAIL,
        priority: Priority.NORMAL,
        templateId,
        variables: {
          username,
          actionUrl: magicLink,
          expiresInMinutes: 5,
          ip,
          device,
          location,
          requestTime: formatRequestTime(locale),
          supportEmail: FROM_SUPPORT,
        },
        metadata: {
          flow: 'create-magic-link',
        },
        sensitive: false,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        createdBy: '2bd07be1-88b4-7a13-b797-b00e417c6102',
      });

      // 4️⃣ Dispatch
      await this.dispatchNotification({
        channel: Channel.EMAIL,
        notificationId: notification.id,
        to: email,
        subject: renderedTitle ?? '',
        body: renderedBody,
        flow: 'create-magic-link',
      });
      this.logger.debug('sendMagicLink dispatch completed: notificationId=%s', notification.id);

      // 5️⃣ Mark as sent
      await this.markAsSent(notification.id, {
        provider: this.resolveProvider(Channel.EMAIL),
      });

      this.logger.info(
        'sendMagicLink processing completed: notificationId=%s username=%s',
        notification.id,
        username,
      );
    } catch (error: unknown) {
      this.logger.error(
        'sendMagicLink processing failed: username=%s error=%s',
        username,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async sendGuestMagicLink(input: GuestMagicLinkNotificationDTO): Promise<void> {
    const channel = input.channel === 'WHATSAPP' ? Channel.WHATSAPP : Channel.EMAIL;
    const magicUrl = new URL(CHECKPOINT_MAGIC_PATH, CHECKPOINT_APP_BASE_URL);
    magicUrl.searchParams.set('token', input.token);
    const magicLink = magicUrl.toString();
    const variables = {
      username: input.username,
      actionUrl: magicLink,
      expiresInMinutes: 5,
      ip: input.ip ?? 'Unknown IP address',
      device: input.device,
      location: input.location,
      requestTime: formatRequestTime(input.locale),
      supportEmail: FROM_SUPPORT,
    };
    const { templateId, renderedTitle, renderedBody } =
      await this.templateRenderService.renderFromKey({
        templateKey: 'auth.guest-magic-link.request',
        channel,
        locale: input.locale,
        variables,
      });

    const notification = await this.create({
      tenantId: input.tenantId,
      recipientUsername: input.username,
      recipientAddress: input.recipient,
      channel,
      priority: Priority.NORMAL,
      templateId,
      variables,
      metadata: {
        flow: 'guest-magic-link',
        correlationId: input.correlationId,
        traceId: input.traceId,
      },
      sensitive: true,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdBy: '2bd07be1-88b4-7a13-b797-b00e417c6102',
    });
    await this.dispatchNotification({
      channel,
      notificationId: notification.id,
      to: input.recipient,
      subject: renderedTitle ?? '',
      body: renderedBody,
      flow: 'guest-magic-link',
      tenantId: input.tenantId,
    });
    await this.markAsSent(notification.id, { provider: this.resolveProvider(channel) });
    this.magicLinkMetrics?.recordDispatch(channel);
    this.logger.info('guest_magic_link_dispatch: %o', {
      result: 'DISPATCHED',
      correlationId: input.correlationId,
      channel: input.channel,
    });
  }

  async sendRequestReset({
    token,
    email,
    locale,
    username,
    device,
    ip,
    location,
  }: SendAuthLinkDTO): Promise<void> {
    this.logger.debug(
      'sendRequestReset processing started: username=%s locale=%s',
      username,
      locale,
    );

    try {
      const resetLink = `${APP_BASE_URL}${RESET_PATH}?token=${encodeURIComponent(token)}`;
      this.logger.debug('sendRequestReset link created: username=%s', username);

      const { templateId, renderedTitle, renderedBody } =
        await this.templateRenderService.renderFromKey({
          templateKey: 'auth.password-reset.request',
          channel: Channel.EMAIL,
          locale,
          variables: {
            username,
            actionUrl: resetLink,
            expiresInMinutes: 15,
            ip,
            device,
            location,
            requestTime: formatRequestTime(locale),
            supportEmail: FROM_SUPPORT,
          },
        });

      const notification = await this.create({
        tenantId: DEFAULT_TENANT_ID,
        recipientUsername: username,
        recipientAddress: email,
        channel: Channel.EMAIL,
        priority: Priority.NORMAL,
        templateId,
        variables: {
          firstName: username,
          actionUrl: resetLink,
          expiresInMinutes: 15,
          ip,
          device,
          location,
          requestTime: formatRequestTime(locale),
          supportEmail: FROM_SUPPORT,
        },
        metadata: {
          flow: 'create-passwort-reset-link',
        },
        sensitive: false,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdBy: '2bd07be1-88b4-7a13-b797-b00e417c6102',
      });

      // 4️⃣ Dispatch
      await this.dispatchNotification({
        channel: Channel.EMAIL,
        notificationId: notification.id,
        to: email,
        subject: renderedTitle ?? '',
        body: renderedBody,
        flow: 'create-passwort-reset-link',
      });
      this.logger.debug('sendRequestReset dispatch completed: notificationId=%s', notification.id);

      // 5️⃣ Mark as sent
      await this.markAsSent(notification.id, {
        provider: this.resolveProvider(Channel.EMAIL),
      });

      this.logger.info(
        'sendRequestReset processing completed: notificationId=%s username=%s',
        notification.id,
        username,
      );
    } catch (error: unknown) {
      this.logger.error(
        'sendRequestReset processing failed: username=%s error=%s',
        username,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async notifyUser(data: NotifyUserCreationEvent): Promise<void> {
    return TraceRunner.run('Notify User Creation', async () => {
      const { email, phoneNumber, username, locale } = data.payload;

      this.logger.debug(
        'notifyUser processing started: username=%s locale=%s',
        username,
        locale ?? 'de-DE',
      );

      /**
       * 1️⃣ Channel Resolution (deterministic, extensible)
       */
      const channel = this.resolveChannel({ email, phoneNumber });

      /**
       * 2️⃣ Build Variables (single source of truth)
       */
      const variables: AccountCreatedVariables = {
        username,
        actionUrl: `${APP_BASE_URL}/welcome`,
        expiresInMinutes: 60 * 24,
        supportEmail: FROM_SUPPORT,
      };

      /**
       * 3️⃣ Render Template (channel-aware)
       */
      const { templateId, renderedTitle, renderedBody } =
        await this.templateRenderService.renderFromKey({
          templateKey: 'account.created',
          channel,
          locale,
          variables,
        });

      /**
       * 4️⃣ Persist Notification
       */
      const notification = await this.create({
        tenantId: DEFAULT_TENANT_ID,
        recipientUsername: username,
        recipientAddress: email ?? phoneNumber ?? 'unknown',
        channel,
        priority: Priority.NORMAL,
        templateId,
        variables: variables as unknown as InputJsonValue,
        metadata: {
          flow: 'notify-user-creation',
          resolvedChannel: channel,
        },
        sensitive: false,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 1000),
        createdBy: '2bd07be1-88b4-7a13-b797-b00e417c6102',
      });

      /**
       * 5️⃣ Dispatch via Channel Adapter
       */
      await this.dispatchNotification({
        channel,
        notificationId: notification.id,
        to: email ?? phoneNumber,
        subject: renderedTitle ?? '',
        body: renderedBody,
      });

      /**
       * 6️⃣ Mark as sent
       */
      await this.markAsSent(notification.id, {
        provider: this.resolveProvider(channel),
      });

      this.logger.info(
        'notifyUser processing completed: notificationId=%s username=%s channel=%s',
        notification.id,
        username,
        channel,
      );
    });
  }

  async sendBulkInvitations(input: BulkInvitationDTO): Promise<BulkInvitationDTO['guests']> {
    return TraceRunner.run('[INVITATION] sendBulkInvitations', async () => {
      this.logger.debug(
        'sendBulkInvitations processing started: guestCount=%s',
        input.guests.length,
      );
      const results = [];
      const error: BulkInvitationDTO['guests'] = [];

      for (const guest of input.guests) {
        const locale = guest.locale ?? 'de-DE';

        const variables: SendInvitationVariables = {
          firstName: guest.firstName,
          lastName: guest.lastName,
          eventName: guest.eventName,
          rsvpUrl: guest.rsvpUrl,
          plusOnes: guest.plusOnes ?? undefined,
          hostName: input.hostName ?? undefined,
        };

        const phoneNumber = getPrimaryPhoneNumber(guest.phoneNumbers);

        if (!phoneNumber && !guest.email) {
          this.logger.warn('sendBulkInvitations guest ignored: contact information missing');
          error.push(guest);
          continue;
        }
        const channel = this.resolveChannel({ phoneNumber, email: guest.email });

        const { templateId, renderedTitle, renderedBody } =
          await this.templateRenderService.renderFromKey({
            templateKey: 'invitation.event.invite',
            channel,
            locale,
            variables,
          });

        const notification = await this.create({
          tenantId: DEFAULT_TENANT_ID,
          recipientUsername: `${guest.firstName}.${guest.lastName}`,
          recipientAddress: guest.email ?? phoneNumber ?? 'unknown',
          channel,
          priority: Priority.NORMAL,
          templateId,
          variables: variables as unknown as InputJsonValue,
          metadata: {
            flow: 'send-invitation',
          },
          sensitive: false,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          createdBy: '2bd07be1-88b4-7a13-b797-b00e417c6102',
        });

        await this.dispatchNotification({
          channel,
          notificationId: notification.id,
          to: guest.email ?? phoneNumber,
          subject: renderedTitle ?? '',
          body: renderedBody,
          flow: 'send-invitation',
        });

        /**
         * 6️⃣ Mark as sent
         */
        await this.markAsSent(notification.id, {
          provider: this.resolveProvider(channel),
        });

        results.push(notification);
      }

      this.logger.info(
        'sendBulkInvitations processing completed: requested=%s sent=%s ignored=%s',
        input.guests.length,
        results.length,
        error.length,
      );

      return error;
      // return results;
    });
  }

  private resolveChannel({
    email,
    phoneNumber,
  }: {
    email?: string;
    phoneNumber?: string;
  }): Channel {
    if (email) {
      return Channel.EMAIL;
    }
    if (phoneNumber) {
      return Channel.WHATSAPP;
    }

    throw new NotificationInputException('recipient-channel-missing');
  }

  private async dispatchNotification(input: {
    channel: Channel;
    to?: string;
    recipientId?: string;
    subject?: string;
    body: string;
    notificationId: string;
    flow?: string;
    tenantId?: string;
  }): Promise<string | undefined> {
    const { channel, notificationId, to, body } = input;

    this.logger.debug(
      'dispatchNotification started: notificationId=%s channel=%s',
      notificationId,
      channel,
    );

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        title: input.subject ?? null,
        body,
        contentFormat: channel === Channel.EMAIL ? 'HTML' : 'TEXT',
        status: NotificationStatus.PROCESSING,
      },
    });

    try {
      switch (channel) {
        case Channel.EMAIL: {
          if (!to) {
            throw new NotificationInputException('email-address-missing', {
              notificationId,
              channel,
            });
          }
          if (!input.subject) {
            throw new NotificationInputException('email-subject-missing', {
              notificationId,
              channel,
            });
          }

          const emailResult = await this.dispatchService.dispatch({
            id: notificationId,
            channel: 'EMAIL',
            recipientId: input.recipientId ?? to,
            recipientAddress: to,
            body,
            contentType: 'HTML',
            // senderId is the stable UUIDv7 system sender identity required by the
            // gateway contract; senderAddress below is the human-facing email "from".
            senderId: FROM_SENDER_ID,
            senderAddress: FROM_NO_REPLY,
            subject: input.subject,
            metadata: {
              conversationId: input.flow,
              tenantId: input.tenantId ?? DEFAULT_TENANT_ID,
            },
          });

          if (!emailResult.success) {
            throw new NotificationDeliveryException('EMAIL', emailResult.error);
          }

          this.logger.info(
            'dispatchNotification completed: notificationId=%s channel=%s provider=%s',
            notificationId,
            channel,
            'gateway',
          );
          return emailResult.providerMessageId;
        }

        case Channel.WHATSAPP: {
          if (!to) {
            throw new NotificationInputException('phone-number-missing', {
              notificationId,
              channel,
            });
          }

          const dispatchResult = await this.dispatchService.dispatch({
            id: notificationId,
            channel: 'WHATSAPP',
            recipientId: input.recipientId ?? to,
            recipientAddress: to,
            body,
            contentType: 'TEXT',
            metadata: {
              tenantId: input.tenantId ?? DEFAULT_TENANT_ID,
            },
          });

          if (!dispatchResult.success) {
            throw new NotificationDeliveryException('WHATSAPP', dispatchResult.error);
          }

          this.logger.info(
            'dispatchNotification completed: notificationId=%s channel=%s provider=%s',
            notificationId,
            channel,
            'gateway',
          );
          return dispatchResult.providerMessageId;
        }

        case Channel.IN_APP:
          if (!input.recipientId) {
            throw new NotificationInputException('recipient-id-missing', {
              notificationId,
              channel,
            });
          }
          await this.prisma.$transaction(async (tx) => {
            await tx.notification.update({
              where: { id: notificationId },
              data: {
                status: NotificationStatus.DELIVERED,
                deliveredAt: new Date(),
              },
            });
            await this.analyticsOutbox.enqueue(tx, 'notification.delivered.v1', {
              eventName: 'NotificationDelivered',
              aggregateId: notificationId,
              aggregateType: 'Notification',
              properties: {
                notificationId,
                channel,
                status: NotificationStatus.DELIVERED,
              },
            });
          });
          await this.valkeyPubSub.publish(`notification.user.${input.recipientId}`, {
            notificationReceived: {
              id: notificationId,
              recipientId: input.recipientId,
              title: input.subject,
              body,
              channel,
              status: NotificationStatus.DELIVERED,
              createdAt: new Date().toISOString(),
            },
          });
          return undefined;
      }
    } catch (error) {
      if (
        error instanceof NotificationInputException ||
        error instanceof NotificationDeliveryException ||
        error instanceof NotificationStateException ||
        error instanceof NotificationChannelUnavailableException
      ) {
        await this.prisma
          .$transaction(async (tx) => {
            await tx.notification.update({
              where: { id: notificationId },
              data: {
                status: NotificationStatus.FAILED,
                failureReason: this.safeFailureReason(error),
              },
            });
            await this.analyticsOutbox.enqueue(tx, 'notification.failed.v1', {
              eventName: 'NotificationFailed',
              aggregateId: notificationId,
              aggregateType: 'Notification',
              properties: {
                notificationId,
                channel,
                status: NotificationStatus.FAILED,
              },
            });
          })
          .catch((updateError) => {
            this.logger.error(
              'dispatchNotification status update failed: notificationId=%s error=%s',
              notificationId,
              String(updateError),
            );
          });
      }
      throw error;
    }
  }

  private resolveProvider(channel: Channel): string {
    switch (channel) {
      case Channel.EMAIL:
      case Channel.WHATSAPP:
        return 'gateway';
      case Channel.IN_APP:
        return 'in-app';
    }
  }

  private safeFailureReason(error: unknown): string {
    if (error instanceof NotificationInputException) {
      return 'INVALID_NOTIFICATION_INPUT';
    }
    if (error instanceof NotificationChannelUnavailableException) {
      return 'CHANNEL_UNAVAILABLE';
    }
    if (error instanceof NotificationStateException) {
      return 'INVALID_NOTIFICATION_STATE';
    }
    return 'DELIVERY_FAILED';
  }
}
