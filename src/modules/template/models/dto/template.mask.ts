// src/notification/template/template.mask.ts

import type { TemplateVariableMap } from './template.types.js';

export function maskSensitiveVariables(
  definitions: TemplateVariableMap,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const masked: Record<string, unknown> = { ...variables };

  for (const [key, def] of Object.entries(definitions)) {
    if (def.sensitive && key in masked) {
      masked[key] = '********';
    }
  }

  return masked;
}
