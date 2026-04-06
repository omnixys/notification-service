import { ScalarsModule } from '../../core/scalars/scalar.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { TemplateMutationResolver } from './resolvers/template-mutation.resolver.js';
import { TemplateQueryResolver } from './resolvers/template-query.resolver.js';
import { TemplateReadService } from './services/template-read.service.js';
import { TemplateWriteService } from './services/template-write.service.js';
import { Module } from '@nestjs/common';

@Module({
  imports: [PrismaModule, ScalarsModule],
  providers: [
    TemplateQueryResolver,
    TemplateMutationResolver,
    TemplateReadService,
    TemplateWriteService,
  ],
  exports: [TemplateReadService, TemplateWriteService],
})
export class TemplateModule {}
