/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { PrismaService } from '../../../prisma/prisma.service.js';
import { toPrismaModelChannel } from '../../notification/models/enums/channel.enum.js';
import { CreateTemplateInput } from '../models/inputs/create-template.input.js';
import { UpdateTemplateInput } from '../models/inputs/update-template.input.js';
import { BadRequestException, Injectable } from '@nestjs/common';
import { OmnixysLogger } from '@omnixys/logger';

@Injectable()
export class TemplateWriteService {
  private readonly logger;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: OmnixysLogger,
  ) {
    this.logger = loggerService.log(this.constructor.name);
  }

  // ─────────────────────────────────────────────
  // CREATE TEMPLATE (with initial version)
  // ─────────────────────────────────────────────
  async create(input: CreateTemplateInput) {
    this.logger.debug('create template: %o', input);

    const prismaChannel = toPrismaModelChannel(input.channel);

    const existing = await this.prisma.template.findFirst({
      where: {
        key: input.key,
        channel: prismaChannel,
      },
    });

    if (existing) {
      throw new BadRequestException('Template with same key/channel already exists');
    }

    const template = await this.prisma.template.create({
      data: {
        key: input.key,
        channel: prismaChannel,
        tenantId: input.tenantId ?? null,
        tags: input.tags ?? [],
        versions: {
          create: {
            locale: input.locale ?? 'de-DE',
            version: 1,
            subject: input.subject ?? null,
            body: input.body,
            format: input.format,
            variables: input.variables ?? {},
            isActive: true,
          },
        },
      },
      include: {
        versions: true,
      },
    });

    return {
      template,
      version: template.versions[0]!,
    };
  }

  // ─────────────────────────────────────────────
  // UPDATE TEMPLATE
  // ─────────────────────────────────────────────
  async update(input: UpdateTemplateInput) {
    this.logger.debug('update template id=%s bumpVersion=%s', input.id, input.bumpVersion);

    const template = await this.prisma.template.findUnique({
      where: { id: input.id },
      include: { versions: true },
    });

    if (!template) {
      throw new BadRequestException('Template not found');
    }

    const activeVersion = template.versions.find((v) => v.isActive);

    if (!activeVersion) {
      throw new BadRequestException('Active template version not found');
    }

    // ── CASE 1: No version bump
    if (!input.bumpVersion) {
      const updatedVersion = await this.prisma.templateVersion.update({
        where: { id: activeVersion.id },
        data: {
          subject: input.subject ?? undefined,
          body: input.body ?? undefined,
          format: input.format ?? undefined,
          variables: input.variables ?? undefined,
          locale: input.locale ?? undefined,
        },
      });

      return {
        template,
        version: updatedVersion,
      };
    }

    // ── CASE 2: Version bump

    await this.prisma.templateVersion.update({
      where: { id: activeVersion.id },
      data: { isActive: false },
    });

    const createdVersion = await this.prisma.templateVersion.create({
      data: {
        templateId: template.id,
        locale: input.locale ?? activeVersion.locale,
        version: activeVersion.version + 1,
        subject: input.subject ?? activeVersion.subject,
        body: input.body ?? activeVersion.body,
        format: input.format ?? activeVersion.format,
        variables: input.variables ?? activeVersion.variables,
        isActive: true,
      },
    });

    return {
      template,
      version: createdVersion,
    };
  }
}
