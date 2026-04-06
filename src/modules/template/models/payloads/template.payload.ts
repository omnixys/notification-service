/* eslint-disable @typescript-eslint/no-explicit-any */
// src/template/models/payloads/template.payload.ts

import { JsonScalar } from '../../../../core/scalars/json.scalar.js';
import { Channel } from '../../../notification/models/enums/channel.enum.js';
import { ContentFormat } from '../../../notification/models/enums/content-format.enum.js';
import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TemplatePayload {
  @Field(() => ID)
  id!: string;

  @Field()
  key!: string;

  @Field(() => Channel)
  channel!: Channel;

  @Field()
  locale!: string;

  @Field({ nullable: true })
  subject?: string;

  @Field()
  body!: string;

  @Field(() => ContentFormat)
  format!: ContentFormat;

  @Field(() => JsonScalar)
  variables!: Record<string, any>;

  @Field()
  version!: number;

  @Field()
  isActive!: boolean;

  @Field(() => [String])
  tags!: string[];

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}
