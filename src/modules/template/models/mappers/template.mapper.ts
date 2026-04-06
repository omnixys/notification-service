/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/template/models/mappers/template.mapper.ts

import type {
  Template,
  TemplateVersion,
} from '../../../../prisma/generated/client.js';
import type { TemplatePayload } from '../payloads/template.payload.js';

export class TemplateMapper {
  static toPayload(input: {
    template: Template;
    version: TemplateVersion;
  }): TemplatePayload {
    const { template, version } = input;

    return {
      id: template.id,
      key: template.key,
      channel: template.channel as any,

      locale: version.locale,
      subject: version.subject ?? undefined,
      body: version.body,
      format: version.format as any,
      variables: version.variables as Record<string, any>,

      version: version.version,
      isActive: version.isActive,

      tags: template.tags ?? [],
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  static toPayloadList(
    list: Array<{ template: Template; version: TemplateVersion }>,
  ): TemplatePayload[] {
    return list.map((item) => this.toPayload(item));
  }
}
