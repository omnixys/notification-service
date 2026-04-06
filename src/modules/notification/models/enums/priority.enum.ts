import { registerEnumType } from '@nestjs/graphql';

export enum Priority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}
registerEnumType(Priority, { name: 'Priority' });
