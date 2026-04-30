import { env } from '../../../config/env.js';
import {
  Notification,
  NotificationStatus,
  Priority,
  Prisma,
} from '../../../prisma/generated/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MailService } from '../../messages/services/mail.service.js';
import { WhatsAppService } from '../../messages/services/whatsapp.service.js';
import { Channel } from '../models/enums/channel.enum.js';
import { BulkInvitationDTO } from '../models/inputs/send-invitations.input.js';
import { getVerificationChannelLabel } from '../models/mappers/verification-channel-label.mapper.js';
import { AccountCreatedVariables } from '../models/variables/account-create-notification.variables..js';
import { CreateGuestVariables } from '../models/variables/create-guest.variables.js';
import { formatRequestTime } from '../utils/date.util.js';
import { NotificationCacheService } from './notification-cache.service.js';
import { SendInvitationVariables, TemplateRenderService } from './template-renderer.service.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserInput } from '@omnixys/graphql';
import { OmnixysLogger } from '@omnixys/logger';
import { TraceRunner } from '@omnixys/observability';
import { EncryptionService } from '@omnixys/security';
import {
  CreatePendingUserDTO,
  GuestSignUpTokenPayload,
  Locale,
  SendAuthLinkDTO,
  SignUpTokenPayload,
  createTmpUsername,
  getPrimaryPhoneNumber,
} from '@omnixys/shared';
import { InputJsonValue } from '@prisma/client/runtime/client';

const {
  APP_BASE_URL,
  VERIFY_PATH,
  VERIFY_GUEST_PATH,
  MAGIC_PATH,
  RESET_PATH,
  FROM_SUPPORT,
  FROM_NO_REPLY,
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
}

@Injectable()
export class NotificationWriteService {
  private readonly logger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationCacheService: NotificationCacheService,
    private readonly mailService: MailService,
    private readonly whatsappService: WhatsAppService,
    private readonly templateRenderService: TemplateRenderService,
    private readonly encryptService: EncryptionService,
    loggerService: OmnixysLogger,
  ) {
    this.logger = loggerService.log(this.constructor.name);
  }

  // ─────────────────────────────────────────────
  // CREATE (Idempotent optional)
  // ─────────────────────────────────────────────
  async create(input: CreateNotificationDTO): Promise<Notification> {
    this.logger.debug('create notification: %o', {
      ...input,
      variables: '[masked]',
    });

    return this.prisma.notification.create({
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
        createdBy: input.createdBy ?? null,
      },
    });
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
      throw new BadRequestException('Cannot cancel already sent/delivered notification');
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
      throw new NotFoundException('Notification not found');
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
      throw new BadRequestException(
        `Cannot mark notification as SENT from status ${existing.status}`,
      );
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.SENT,
        deliveredAt: new Date(),
        provider: options?.provider ?? existing.provider ?? null,
        providerRef: options?.providerRef ?? existing.providerRef ?? null,
      },
    });
  }

  async createSignupVerification({
    createUserInput,
    locale,
  }: {
    createUserInput: CreateUserInput;
    locale: Locale;
  }): Promise<string> {
    return TraceRunner.run('Create SignUp Verification', async () => {
      this.logger.debug('creating signUp verification');

      // 1️⃣ Store payload in Valkey
      const signUpTokens: SignUpTokenPayload =
        await this.notificationCacheService.storeSignupVerificationPayload(
          createUserInput,
          {},
          60 * 15,
        );

      const payload = {
        ...signUpTokens,
        timestamp: Date.now(),
      };

      const verificationId = this.encryptService.encrypt(JSON.stringify(payload), true);

      const verifyUrl = `${APP_BASE_URL}${VERIFY_PATH}?token=${verificationId}`;
      this.logger.debug('Created Verify Link %s', verifyUrl);

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
        tenantId: 'omnixys',
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
        createdBy: 'notification-service',
      });

      // 4️⃣ Send Mail
      await this.mailService.send({
        to: createUserInput.personalInfo.email,
        subject: renderedTitle ?? '',
        html: renderedBody,
        format: 'HTML',
        from: FROM_NO_REPLY,
        metadata: {
          notificationId: notification.id,
          flow: 'signup-verification',
        },
      });

      // 5️⃣ Mark as sent
      await this.markAsSent(notification.id, {
        provider: 'resend',
      });

      return verificationId;
    });
  }

  async confirmGuest(input: CreatePendingUserDTO, eventName: string, seat?: string): Promise<void> {
    return TraceRunner.run('Create Guest SignUp Verification', async () => {
      this.logger.debug('creating Guest signUp verification');

      // 1️⃣ Store payload in Valkey
      const guestSignUpTokens: GuestSignUpTokenPayload =
        await this.notificationCacheService.storeGuestVerificationPayload(input, 60 * 15);

      const payload = {
        ...guestSignUpTokens,
        timestamp: Date.now(),
      };

      const verificationId = this.encryptService.encrypt(JSON.stringify(payload), true);

      const verifyUrl = `${APP_BASE_URL}${VERIFY_GUEST_PATH}?token=${verificationId}`;
      this.logger.debug('Created Guest Verify Link %s', verifyUrl);

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
        tenantId: 'omnixys',
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
        createdBy: 'notification-service',
      });

      /**
       * 5️⃣ Dispatch via Channel Adapter
       */
      await this.dispatchNotification({
        channel,
        notificationId: notification.id,
        to: input.email ?? phoneNumber,
        subject: renderedTitle ?? '',
        body: renderedBody,
        flow: 'guest-verification',
      });

      /**
       * 6️⃣ Mark as sent
       */
      await this.markAsSent(notification.id, {
        provider: this.resolveProvider(channel),
      });
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
    this.logger.debug('creating Magic Link');

    const magicLink = `${APP_BASE_URL}${MAGIC_PATH}?token=${encodeURIComponent(token)}`;
    this.logger.debug('Created Magic Link %s', magicLink);

    const { templateId, renderedTitle, renderedBody } =
      await this.templateRenderService.renderFromKey({
        templateKey: 'auth.magic-link.request',
        channel: Channel.EMAIL,
        locale,
        variables: {
          username,
          actionUrl: magicLink,
          expiresInMinutes: 15,
          ip,
          device,
          location,
          requestTime: formatRequestTime(locale),
          supportEmail: FROM_SUPPORT,
        },
      });

    const notification = await this.create({
      tenantId: 'omnixys',
      recipientUsername: username,
      recipientAddress: email,
      channel: Channel.EMAIL,
      priority: Priority.NORMAL,
      templateId,
      variables: {
        username,
        actionUrl: magicLink,
        expiresInMinutes: 15,
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
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdBy: 'notification-service',
    });

    // 4️⃣ Send Mail
    await this.mailService.send({
      to: email,
      subject: renderedTitle ?? '',
      html: renderedBody,
      format: 'HTML',
      from: FROM_NO_REPLY,
      metadata: {
        notificationId: notification.id,
        flow: 'signup-verification',
      },
    });

    // 5️⃣ Mark as sent
    await this.markAsSent(notification.id, {
      provider: 'resend',
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
    this.logger.debug('creating Reset Link');

    const resetLink = `${APP_BASE_URL}${RESET_PATH}?token=${encodeURIComponent(token)}`;
    this.logger.debug('Created Reset Link %s', resetLink);

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
      tenantId: 'omnixys',
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
      createdBy: 'notification-service',
    });

    // 4️⃣ Send Mail
    await this.mailService.send({
      to: email,
      subject: renderedTitle ?? '',
      html: renderedBody,
      format: 'HTML',
      from: FROM_NO_REPLY,
      replyTo: FROM_SUPPORT,
      metadata: {
        notificationId: notification.id,
        flow: 'create-passwort-reset-link',
      },
    });

    // 5️⃣ Mark as sent
    await this.markAsSent(notification.id, {
      provider: 'resend',
    });
  }

  async notifyUser(data: NotifyUserCreationEvent): Promise<void> {
    return TraceRunner.run('Notify User Creation', async () => {
      this.logger.debug('Notifying user creation: %o', data);

      const { email, phoneNumber, username, locale } = data.payload;

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
        tenantId: 'omnixys',
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
        createdBy: 'notification-service',
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
    });
  }

  async sendBulkInvitations(input: BulkInvitationDTO): Promise<BulkInvitationDTO['guests']> {
    return TraceRunner.run('[INVITATION] sendBulkInvitations', async () => {
      this.logger.debug('sendBulkInvitations: inpu=%o', input);
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
          this.logger.debug('sendBulkInvitations: NO Contact INFO SKIP!!');
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
          tenantId: 'omnixys',
          recipientUsername: `${guest.firstName}.${guest.lastName}`,
          recipientAddress: guest.email ?? phoneNumber ?? 'unknown',
          channel: Channel.EMAIL,
          priority: Priority.NORMAL,
          templateId,
          variables: variables as unknown as InputJsonValue,
          metadata: {
            flow: 'send-invitation',
          },
          sensitive: false,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          createdBy: 'notification-service',
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

    throw new Error('No valid communication channel provided (email or phoneNumber required)');
  }

  private async dispatchNotification(input: {
    channel: Channel;
    to?: string;
    subject?: string;
    body: string;
    notificationId: string;
    flow?: string;
  }): Promise<void> {
    const { channel, notificationId, to, body, flow } = input;
    switch (channel) {
      case Channel.EMAIL:
        if (!to) {
          throw new Error('Missing email address');
        }
        if (!input.subject) {
          throw new Error('Missing email subject');
        }

        await this.mailService.send({
          to,
          subject: input.subject,
          html: body,
          format: 'HTML',
          from: FROM_NO_REPLY,
          metadata: {
            notificationId,
            channel: 'email',
            flow: flow ?? 'Unknown Flow',
          },
        });
        return;

      case Channel.WHATSAPP:
        if (!to) {
          throw new Error('Missing phone number');
        }

        await this.whatsappService.send({
          to,
          message: body,
          metadata: {
            notificationId,
            channel: 'whatsapp',
            flow: flow ?? 'Unknown Flow',
          },
        });
        return;

      case Channel.IN_APP:
      case Channel.PUSH:
      case Channel.SMS:
        throw new Error(`Unsupported channel: ${channel}`);
    }
  }

  private resolveProvider(channel: Channel): string {
    switch (channel) {
      case Channel.EMAIL:
        return 'resend';
      case Channel.WHATSAPP:
        return 'whatsapp-api';
      case Channel.IN_APP:
      case Channel.PUSH:
      case Channel.SMS:
        return 'unknown';
    }
  }
}
