import { Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module.js';
import { MailModule } from '../mail/mail.module.js';
import { PushModule } from '../push/push.module.js';
import { DigestController } from './digest.controller.js';
import { DigestService } from './digest.service.js';
import { MatchNotifier } from './match-notifier.js';

@Module({
  imports: [ChatsModule, MailModule, PushModule],
  controllers: [DigestController],
  providers: [DigestService, MatchNotifier],
})
export class NotificationsModule {}
