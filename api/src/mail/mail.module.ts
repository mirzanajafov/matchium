import { Global, Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module.js';
import { DigestService } from './digest.service.js';
import { MailController } from './mail.controller.js';
import { Mailer, SmtpMailer } from './mailer.js';

@Global()
@Module({
  imports: [ChatsModule],
  controllers: [MailController],
  providers: [DigestService, { provide: Mailer, useClass: SmtpMailer }],
  exports: [DigestService],
})
export class MailModule {}
