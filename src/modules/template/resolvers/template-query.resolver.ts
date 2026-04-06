import { Args, Int, Query, Resolver } from '@nestjs/graphql';

import { Channel } from '../../notification/models/enums/channel.enum.js';
import { TemplateMapper } from '../models/mappers/template.mapper.js';
import { TemplatePayload } from '../models/payloads/template.payload.js';
import { TemplateReadService } from '../services/template-read.service.js';
import { OmnixysLogger } from '@omnixys/logger';

@Resolver()
export class TemplateQueryResolver {
  private readonly logger;

  constructor(
    loggerService: OmnixysLogger,
    private readonly templateReadService: TemplateReadService,
  ) {
    this.logger = loggerService.log(this.constructor.name);
  }

  @Query(() => [TemplatePayload])
  async templates(
    @Args('search', { nullable: true }) search?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<TemplatePayload[]> {
    this.logger.debug('');
    const templates = await this.templateReadService.findForAdmin(
      search,
      limit ?? 50,
    );

    const result: TemplatePayload[] = [];

    for (const template of templates) {
      for (const version of template.versions) {
        result.push(TemplateMapper.toPayload({ template, version }));
      }
    }

    return result;
  }

  @Query(() => TemplatePayload)
  async activeTemplate(
    @Args('key') key: string,
    @Args('channel', { type: () => Channel }) channel: Channel,
    @Args('locale', { nullable: true }) locale?: string,
  ): Promise<TemplatePayload> {
    const result = await this.templateReadService.findActiveByKey(
      key,
      channel,
      locale ?? 'de-DE',
    );
    return TemplateMapper.toPayload(result);
  }
}
