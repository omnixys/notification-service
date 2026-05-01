import { Field, ID, InputType } from '@nestjs/graphql';
import { PhoneNumberInput } from '@omnixys/graphql';
import type { Locale, PhoneNumberDTO } from '@omnixys/shared';

export interface BulkInvitationDTO {
  hostName?: string;

  guests: Array<{
    firstName: string;
    lastName: string;
    email?: string;
    phoneNumbers?: PhoneNumberDTO[];
    plusOnes?: number;
    locale?: Locale;
    rsvpUrl: string;
    eventId: string;
    eventName: string;
  }>;
}

@InputType()
export class InvitationGuestInput {
  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field({ nullable: true })
  email?: string;

  @Field(() => [PhoneNumberInput], { nullable: true })
  phoneNumbers?: PhoneNumberInput[];

  @Field({ nullable: true })
  plusOnes?: number;

  @Field({ nullable: true })
  locale?: Locale;

  @Field(() => ID)
  eventId!: string;

  @Field()
  eventName!: string;

  @Field()
  rsvpUrl!: string;

  @Field({ nullable: true })
  rootInvitee?: string;
}

@InputType()
export class SendInvitationsInput implements BulkInvitationDTO {
  @Field({ nullable: true })
  hostName?: string;

  @Field(() => [InvitationGuestInput])
  guests!: InvitationGuestInput[];
}
