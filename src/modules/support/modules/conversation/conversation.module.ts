import { SupportCommonModule } from '../../common/support-common.module.js';
import { InvitationSupportClientService } from '../../rsvp/invitation-support-client.service.js';
import { MappingModule } from '../mapping/mapping.module.js';
import { ConversationResolver } from './conversation.resolver.js';
import { ConversationService } from './conversation.service.js';
import { Module } from '@nestjs/common';

@Module({
  imports: [SupportCommonModule, MappingModule],
  providers: [ConversationService, ConversationResolver, InvitationSupportClientService],
  exports: [ConversationService],
})
export class ConversationModule {}
