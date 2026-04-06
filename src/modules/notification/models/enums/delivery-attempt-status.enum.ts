import { registerEnumType } from '@nestjs/graphql';

export enum DeliveryAttemptStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}
registerEnumType(DeliveryAttemptStatus, { name: 'DeliveryAttemptStatus' });
