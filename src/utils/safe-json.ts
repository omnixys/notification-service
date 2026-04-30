// src/prisma/utils/safe-json.ts

import { Prisma } from '../prisma/generated/client.js';

export function safeJson(
  value: unknown,
): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }
  return value;
}
