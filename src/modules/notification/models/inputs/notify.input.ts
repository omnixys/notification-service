import { JsonScalar } from '../../../../core/scalars/json.scalar.js';
import { Channel } from '../enums/channel.enum.js';
import { Priority } from '../enums/priority.enum.js';
import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class NotificationInput {
  /**
   * Business template identifier (NOT a DB id)
   * Example: "account.credentials.created"
   */
  @Field()
  templateKey!: string;

  /**
   * Delivery channel
   */
  @Field(() => Channel)
  channel!: Channel;

  /**
   * Locale for template resolution (default: de-DE)
   */
  @Field({ defaultValue: 'de-DE' })
  locale?: string;

  /**
   * Stable recipient identifier (Keycloak sub)
   */
  @Field({ nullable: true })
  recipientId?: string;

  /**
   * Display / fallback username
   */
  @Field()
  recipientUsername!: string;

  @Field({ nullable: true })
  recipientTenant?: string;

  /**
   * Variables passed to template renderer
   */
  @Field(() => JsonScalar)
  variables!: Record<string, unknown>;

  /**
   * Idempotency key (Kafka / retry safe)
   */
  @Field({ nullable: true })
  dedupeKey?: string;

  @Field(() => Priority, { defaultValue: Priority.NORMAL })
  priority?: Priority;

  @Field({ nullable: true })
  category?: string;

  @Field({ nullable: true })
  linkUrl?: string;

  /**
   * Marks notification as sensitive (e.g. credentials)
   */
  @Field({ defaultValue: false })
  sensitive?: boolean;

  /**
   * Optional TTL in seconds
   */
  @Field(() => Int, { nullable: true })
  ttlSeconds?: number;
}
