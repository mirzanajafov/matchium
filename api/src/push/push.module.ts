import { Module } from '@nestjs/common';
import { PushSender, WebPushSender } from './push-sender.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [PushController],
  providers: [PushService, { provide: PushSender, useClass: WebPushSender }],
  exports: [PushService],
})
export class PushModule {}
