/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { Channel as PrismaChannel } from '../../../prisma/generated/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Channel, toPrismaModelChannel } from '../../notification/models/enums/channel.enum.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { OmnixysLogger } from '@omnixys/logger';

@Injectable()
export class TemplateReadService {
  private readonly logger;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: OmnixysLogger,
  ) {
    this.logger = loggerService.log(this.constructor.name);
  }

  /**
   * Find template by ID (without versions)
   */
  async findById(id: string) {
    this.logger.debug('findById: id=%s', id);

    const template = await this.prisma.template.findUnique({
      where: { id },
      include: {
        versions: true,
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;

    // return TemplateMapper.toPayload(template);
  }

  /**
   * Runtime-safe lookup.
   * Returns the latest active version for key + channel + locale.
   */
  async findActiveByKey(key: string, channel: Channel | PrismaChannel, locale = 'de-DE') {
    this.logger.debug('findActiveByKey: key=%s channel=%s locale=%s', key, channel, locale);

    const prismaChannel = toPrismaModelChannel(channel);

    const template = await this.prisma.template.findFirst({
      where: {
        key,
        channel: prismaChannel,
      },
      include: {
        versions: {
          where: {
            locale,
            isActive: true,
          },
          orderBy: {
            version: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!template || template.versions.length === 0) {
      throw new NotFoundException(`Active template not found for key=${key}, locale=${locale}`);
    }

    const activeVersion = template.versions[0]!;

    return {
      template,
      version: activeVersion,
    };
  }

  /**
   * Returns specific version explicitly (for debugging / admin usage)
   */
  async findSpecificVersion(key: string, channel: Channel, locale: string, version: number) {
    this.logger.debug(
      'findSpecificVersion: key=%s channel=%s locale=%s version=%s',
      key,
      channel,
      locale,
      version,
    );

    const prismaChannel = toPrismaModelChannel(channel);

    const template = await this.prisma.template.findFirst({
      where: {
        key,
        channel: prismaChannel,
      },
      include: {
        versions: {
          where: {
            locale,
            version,
          },
        },
      },
    });

    if (!template || template.versions.length === 0) {
      throw new NotFoundException(
        `Template version not found for key=${key}, locale=${locale}, version=${version}`,
      );
    }

    return {
      template,
      version: template.versions[0],
    };

    // return TemplateMapper.toPayload({
    //   template,
    //   version: template.versions[0],
    // });
  }

  /**
   * Admin search
   * Returns templates with all versions
   */
  async findForAdmin(search?: string, limit = 50) {
    this.logger.debug('findForAdmin: search=%s limit=%s', search, limit);

    const templates = await this.prisma.template.findMany({
      where: search
        ? {
            key: {
              contains: search,
              mode: 'insensitive',
            },
          }
        : {},
      include: {
        versions: {
          orderBy: {
            version: 'desc',
          },
        },
      },
      take: Math.min(limit, 100),
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return templates;
  }
}
