import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class BulkSendInvitationsPayload {
  @Field()
  total!: number;

  @Field()
  created!: number;

  @Field()
  skipped!: number;
}
