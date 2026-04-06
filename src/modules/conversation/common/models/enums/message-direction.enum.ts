// common/enums/message-direction.enum.ts

import { registerEnumType } from "@nestjs/graphql";

export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

registerEnumType(MessageDirection, {
  name: 'MessageDirection',
});