import { Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module.js';
import { InboxController } from './inbox.controller.js';

@Module({
  imports: [ChatsModule],
  controllers: [InboxController],
})
export class InboxModule {}
