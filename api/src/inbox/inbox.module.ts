import { Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module.js';
import { MailModule } from '../mail/mail.module.js';
import { InboxController } from './inbox.controller.js';
import { InboxService } from './inbox.service.js';

@Module({
  imports: [ChatsModule, MailModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
