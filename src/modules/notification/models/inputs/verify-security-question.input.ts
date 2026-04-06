// verify-security-question.input.ts
import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class VerifySecurityQuestionInput {
  @Field()
  questionId!: string;

  @Field()
  answer!: string;
}
