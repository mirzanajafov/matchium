import { Global, Module } from '@nestjs/common';
import { MatchNotifier } from './match-notifier.js';
import { PushSender, WebPushSender } from './push-sender.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

@Global()
@Module({
  controllers: [PushController],
  providers: [PushService, MatchNotifier, { provide: PushSender, useClass: WebPushSender }],
  exports: [PushService],
})
export class PushModule {}
