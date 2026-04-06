import { Args, Mutation, Resolver } from '@nestjs/graphql';

import { CreateTemplateInput } from '../models/inputs/create-template.input.js';
import { UpdateTemplateInput } from '../models/inputs/update-template.input.js';
import { TemplateMapper } from '../models/mappers/template.mapper.js';
import { TemplatePayload } from '../models/payloads/template.payload.js';
import { TemplateWriteService } from '../services/template-write.service.js';
import { OmnixysLogger } from '@omnixys/logger';

@Resolver()
export class TemplateMutationResolver {
  private readonly logger;

  constructor(
    loggerService: OmnixysLogger,
    private readonly templateWriteService: TemplateWriteService,
  ) {
    this.logger = loggerService.log(this.constructor.name);
  }

  @Mutation(() => TemplatePayload)
  async createTemplate(
    @Args('input') input: CreateTemplateInput,
  ): Promise<TemplatePayload> {
    this.logger.info('createTemplate: key=%s', input.key);

    const payload = await this.templateWriteService.create(input);
    return TemplateMapper.toPayload(payload);
  }

  @Mutation(() => TemplatePayload)
  async updateTemplate(
    @Args('input') input: UpdateTemplateInput,
  ): Promise<TemplatePayload> {
    this.logger.info(
      'updateTemplate: id=%s bumpVersion=%s',
      input.id,
      input.bumpVersion,
    );

    const payload = await this.templateWriteService.update(input);
    return TemplateMapper.toPayload(payload);
  }
}
