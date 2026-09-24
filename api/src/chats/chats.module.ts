import { Module } from '@nestjs/common';
import { ChatEvents } from './chat-events.js';
import { ChatsController } from './chats.controller.js';
import { ChatsService } from './chats.service.js';

@Module({
  controllers: [ChatsController],
  providers: [ChatsService, ChatEvents],
  exports: [ChatsService],
})
export class ChatsModule {}
