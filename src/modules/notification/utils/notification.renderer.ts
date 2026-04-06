/* eslint-disable @typescript-eslint/switch-exhaustiveness-check */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import Handlebars from 'handlebars';

export interface VariableDefinition {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'email' | 'url';
  sensitive?: boolean;
}

export type VariableSchema = Record<string, VariableDefinition>;

export class NotificationTemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationTemplateValidationError';
  }
}

export class NotificationRenderer {
  validate(schema: VariableSchema, vars: Record<string, unknown>): void {
    for (const [key, def] of Object.entries(schema)) {
      const value = vars[key];

      if (def.required && (value === undefined || value === null)) {
        throw new NotificationTemplateValidationError(
          `Missing required variable: ${key}`,
        );
      }

      if (value == null) {
        continue;
      }

      if (def.type) {
        this.validateType(key, value, def.type);
      }
    }
  }

  private validateType(
    key: string,
    value: unknown,
    type: VariableDefinition['type'],
  ) {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new NotificationTemplateValidationError(
            `Variable ${key} must be string`,
          );
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          throw new NotificationTemplateValidationError(
            `Variable ${key} must be number`,
          );
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new NotificationTemplateValidationError(
            `Variable ${key} must be boolean`,
          );
        }
        break;

      case 'email':
        if (
          typeof value !== 'string' ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ) {
          throw new NotificationTemplateValidationError(
            `Variable ${key} must be valid email`,
          );
        }
        break;

      case 'url':
        try {
          new URL(String(value));
        } catch {
          throw new NotificationTemplateValidationError(
            `Variable ${key} must be valid URL`,
          );
        }
        break;
    }
  }

  render(
    template: { title?: string | null; body: string },
    vars: Record<string, unknown>,
  ): { title?: string; body: string } {
    const bodyCompiler = Handlebars.compile(template.body, {
      noEscape: true, // intentional: escape must be handled by channel
    });

    const titleCompiler = template.title
      ? Handlebars.compile(template.title, { noEscape: true })
      : null;

    return {
      title: titleCompiler ? titleCompiler(vars) : undefined,
      body: bodyCompiler(vars),
    };
  }

  /**
   * Utility for safe logging (mask sensitive variables)
   */
  maskSensitive(
    schema: VariableSchema,
    vars: Record<string, unknown>,
  ): Record<string, unknown> {
    const masked = { ...vars };

    for (const [key, def] of Object.entries(schema)) {
      if (def.sensitive && key in masked) {
        masked[key] = '********';
      }
    }

    return masked;
  }
}
