// src/notification/template/template.errors.ts

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateValidationError';
  }
}
