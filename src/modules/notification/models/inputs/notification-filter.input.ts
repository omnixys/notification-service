// notification/models/inputs/notification-filter.input.ts

import { Channel } from '../enums/channel.enum.js';
import { NotificationStatus } from '../enums/notification-status.enum.js';
import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class NotificationFilterInput {
  @Field({ nullable: true })
  recipientId?: string;

  @Field(() => NotificationStatus, { nullable: true })
  status?: NotificationStatus;

  @Field(() => Channel, { nullable: true })
  channel?: Channel;

  @Field({ nullable: true })
  unreadOnly?: boolean;
}
