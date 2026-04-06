import { ContentFormat } from '../../../notification/models/enums/content-format.enum.js';
import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class UpdateTemplateInput {
  @Field(() => ID)
  id!: string;

  // ── Version Content Updates ────────────────

  @Field({ nullable: true })
  subject?: string;

  @Field({ nullable: true })
  body?: string;

  @Field(() => ContentFormat, { nullable: true })
  format?: ContentFormat;

  @Field(() => [String], { nullable: true })
  variables!: string[];

  @Field({ nullable: true })
  locale?: string;

  // ── Template Meta Updates ──────────────────

  @Field(() => [String], { nullable: true })
  tags?: string[];

  // ── Version Control ────────────────────────

  @Field({ defaultValue: false })
  bumpVersion?: boolean;
}
