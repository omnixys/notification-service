// modules/message/entities/message.entity.ts

import { Field, ID, ObjectType } from '@nestjs/graphql';
import { MessageDirection } from '../../../common/models/enums/message-direction.enum.js';

@ObjectType()
export class Message {
  @Field(() => ID)
  id!: string;

  @Field()
  chatId!: string;

  @Field(() => MessageDirection)
  direction!: MessageDirection;

  @Field()
  from!: string;

  @Field()
  to!: string;

  @Field({ nullable: true })
  body?: string;

  @Field({ nullable: true })
  mediaUrl?: string;

  @Field({ nullable: true })
  messageId?: string;

  @Field()
  createdAt!: Date;
}
