import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum InternalConversationType {
  BROADCAST = 'BROADCAST',
  DIRECT = 'DIRECT',
  ROLE_CHANNEL = 'ROLE_CHANNEL',
}

export enum InternalConversationChannel {
  IN_APP = 'IN_APP',
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
}

export enum InternalMessagePriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

registerEnumType(InternalConversationType, {
  name: 'InternalConversationType',
});
registerEnumType(InternalConversationChannel, {
  name: 'InternalConversationChannel',
});
registerEnumType(InternalMessagePriority, { name: 'InternalMessagePriority' });

// Maps the persisted ConversationChannel value (WEBCHAT) to the dedicated
// internal-conversation channel surface (IN_APP). Support conversations keep
// their inbound provider channel (WHATSAPP / EMAIL) untouched.
export function toApiChannel(channel: string): InternalConversationChannel {
  if (channel === 'WHATSAPP') {
    return InternalConversationChannel.WHATSAPP;
  }
  if (channel === 'EMAIL') {
    return InternalConversationChannel.EMAIL;
  }
  return InternalConversationChannel.IN_APP;
}

export function mapConversationChannel<T extends { channel: string }>(
  row: T,
): Omit<T, 'channel'> & { channel: InternalConversationChannel } {
  return { ...row, channel: toApiChannel(row.channel) };
}

export function mapMessageChannel<T extends { channel: string }>(
  row: T,
): Omit<T, 'channel'> & { channel: InternalConversationChannel } {
  return { ...row, channel: toApiChannel(row.channel) };
}

@ObjectType()
export class InternalConversation {
  @Field(() => ID)
  id!: string;

  @Field()
  eventId!: string;

  @Field(() => InternalConversationChannel)
  channel!: InternalConversationChannel;

  @Field()
  title!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => InternalConversationType)
  type!: InternalConversationType;

  @Field({ nullable: true })
  roleId?: string;

  @Field()
  createdBy!: string;

  @Field()
  isActive!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field({ nullable: true })
  archivedAt?: Date;

  @Field(() => Int, { nullable: true })
  unreadCount?: number;

  @Field(() => [InternalParticipant], { nullable: true })
  participants?: InternalParticipant[];
}

@ObjectType()
export class InternalMessage {
  @Field(() => ID)
  id!: string;

  @Field()
  conversationId!: string;

  @Field()
  senderId!: string;

  @Field(() => InternalConversationChannel)
  channel!: InternalConversationChannel;

  @Field()
  body!: string;

  @Field(() => InternalMessagePriority)
  priority!: InternalMessagePriority;

  @Field()
  createdAt!: Date;

  @Field({ nullable: true })
  editedAt?: Date;
}

@ObjectType()
export class InternalParticipant {
  @Field(() => ID)
  id!: string;

  @Field()
  conversationId!: string;

  @Field()
  userId!: string;

  @Field({ nullable: true })
  lastReadAt?: Date;

  @Field()
  joinedAt!: Date;

  @Field({ nullable: true })
  leftAt?: Date;
}
