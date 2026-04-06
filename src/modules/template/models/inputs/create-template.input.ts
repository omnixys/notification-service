import { Channel } from '../../../notification/models/enums/channel.enum.js';
import { ContentFormat } from '../../../notification/models/enums/content-format.enum.js';
import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateTemplateInput {
  @Field()
  key!: string;

  @Field(() => Channel, { defaultValue: Channel.IN_APP })
  channel!: Channel;

  @Field({ nullable: true })
  tenantId?: string;

  // ── Version Data ───────────────────────────

  @Field({ defaultValue: 'de-DE' })
  locale!: string;

  @Field({ nullable: true })
  subject?: string;

  @Field()
  body!: string;

  @Field(() => ContentFormat)
  format!: ContentFormat;

  @Field(() => [String])
  variables!: string[];

  @Field(() => [String], { nullable: true })
  tags?: string[];
}
