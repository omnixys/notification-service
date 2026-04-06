/* eslint-disable @typescript-eslint/no-explicit-any */
// notification/models/inputs/create-notification.input.ts

import { JsonScalar } from '../../../../core/scalars/json.scalar.js';
import { Channel } from '../enums/channel.enum.js';
import { Priority } from '../enums/priority.enum.js';
import { Field, InputType, GraphQLISODateTime } from '@nestjs/graphql';

@InputType()
export class CreateNotificationInput {
  @Field({ nullable: true })
  tenantId?: string;

  @Field()
  recipientUsername!: string;

  @Field({ nullable: true })
  recipientId?: string;

  @Field({ nullable: true })
  recipientAddress?: string;

  @Field(() => Channel)
  channel!: Channel;

  @Field(() => Priority, { nullable: true })
  priority?: Priority;

  @Field({ nullable: true })
  templateId?: string;

  @Field(() => JsonScalar, { nullable: true })
  variables?: any;

  @Field(() => JsonScalar, { nullable: true })
  metadata?: any;

  @Field({ nullable: true })
  sensitive?: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt?: Date;

  @Field({ nullable: true })
  dedupeKey?: string;
}
