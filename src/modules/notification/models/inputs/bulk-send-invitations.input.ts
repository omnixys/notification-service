import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class BulkSendInvitationRecipientInput {
  @Field(() => ID)
  invitationId!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field()
  rsvpUrl!: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  phoneNumber?: string;
}

@InputType()
export class BulkSendInvitationsInput {
  @Field(() => ID)
  templateId!: string;

  @Field(() => [BulkSendInvitationRecipientInput])
  recipients!: BulkSendInvitationRecipientInput[];
}
