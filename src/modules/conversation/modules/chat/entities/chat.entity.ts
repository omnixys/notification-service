// modules/chat/entities/chat.entity.ts

import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Chat {
  @Field(() => ID)
  id!: string;

  @Field()
  chatId!: string;

  @Field({ nullable: true })
  name?: string;

  @Field()
  isGroup!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
