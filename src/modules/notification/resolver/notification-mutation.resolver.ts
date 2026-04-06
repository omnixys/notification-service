/* eslint-disable @typescript-eslint/no-unsafe-call */
import { CreateNotificationInput } from '../models/inputs/create-notification.input.js';
import { NotificationMapper } from '../models/mappers/notification.mapper.js';
import { NotificationPayload } from '../models/payloads/notification.payload.js';
import { NotificationWriteService } from '../services/notification-write.service.js';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ClientIp, Device, Location, RequestCookies } from '@omnixys/context';
import { CreateUserInput } from '@omnixys/graphql';
import { OmnixysLogger } from '@omnixys/logger';
import { OmnixysCookieRequest } from '@omnixys/shared';

@Resolver()
export class NotificationMutationResolver {
  private readonly logger;

  constructor(
    loggerService: OmnixysLogger,
    private readonly notificationWriteService: NotificationWriteService,
  ) {
    this.logger = loggerService.log(this.constructor.name);
  }

  // ─────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────

  @Mutation(() => NotificationPayload)
  async createNotification(
    @Args('input') input: CreateNotificationInput,
  ): Promise<NotificationPayload> {
    this.logger.info(
      'createNotification: recipient=%s',
      input.recipientUsername,
    );

    const entity = await this.notificationWriteService.create({
      ...input,
    });

    return NotificationMapper.toPayload(entity);
  }

  // ─────────────────────────────────────────────
  // MARK AS READ
  // ─────────────────────────────────────────────

  @Mutation(() => NotificationPayload)
  async markNotificationAsRead(
    @Args('id') id: string,
  ): Promise<NotificationPayload> {
    const entity = await this.notificationWriteService.markAsRead(id);
    return NotificationMapper.toPayload(entity);
  }

  @Mutation(() => NotificationPayload)
  async markNotificationAsUnread(
    @Args('id') id: string,
  ): Promise<NotificationPayload> {
    const entity = await this.notificationWriteService.markAsUnread(id);
    return NotificationMapper.toPayload(entity);
  }

  // ─────────────────────────────────────────────
  // ARCHIVE
  // ─────────────────────────────────────────────

  @Mutation(() => NotificationPayload)
  async archiveNotification(
    @Args('id') id: string,
  ): Promise<NotificationPayload> {
    const entity = await this.notificationWriteService.archive(id);
    return NotificationMapper.toPayload(entity);
  }

  @Mutation(() => NotificationPayload)
  async unarchiveNotification(
    @Args('id') id: string,
  ): Promise<NotificationPayload> {
    const entity = await this.notificationWriteService.unarchive(id);
    return NotificationMapper.toPayload(entity);
  }

  // ─────────────────────────────────────────────
  // CANCEL
  // ─────────────────────────────────────────────

  @Mutation(() => NotificationPayload)
  async cancelNotification(
    @Args('id') id: string,
  ): Promise<NotificationPayload> {
    const entity = await this.notificationWriteService.cancel(id);
    return NotificationMapper.toPayload(entity);
  }

  // ─────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────

  @Mutation(() => Boolean)
  async deleteNotification(@Args('id') id: string): Promise<boolean> {
    await this.notificationWriteService.delete(id);
    return true;
  }

  @Mutation(() => Boolean)
  async createSignupVerification(
    @Args('createUserInput') createUserInput: CreateUserInput,
    @RequestCookies() cookies: OmnixysCookieRequest,
    @Device() device: string,
    @Location() location: string,
    @ClientIp() ipAddress?: string,
  ): Promise<boolean> {
    const locale = cookies.locale ?? 'en-US';

    this.logger.info(
      'createSignupVerification: username=%s locale=%s',
      createUserInput.username,
      locale,
    );

    console.debug({ ipAddress, device, location });

    await this.notificationWriteService.createSignupVerification({
      createUserInput,
      locale,
    });

    return true;
  }
}
