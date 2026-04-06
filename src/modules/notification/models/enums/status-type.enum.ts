import { registerEnumType } from '@nestjs/graphql';

/**
 * Represents a generic business status.
 * Mirrors the Prisma enum `StatusType`.
 */
export enum StatusType {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
  PENDING = 'PENDING',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

registerEnumType(StatusType, {
  name: 'StatusType',
  description: 'Represents a business or account-related status.',
});
