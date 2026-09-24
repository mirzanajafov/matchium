import { Body, Controller, Get, MessageEvent, Param, ParseUUIDPipe, Post, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ChatsService } from './chats.service.js';
import { MessagesQueryDto } from './dto/messages-query.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';

@ApiTags('chats')
@ApiBearerAuth()
@Controller('chats')
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.chats.list(user.id);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() query: MessagesQueryDto) {
    return this.chats.messages(user.id, id, query.after);
  }

  @Post(':id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.chats.send(user.id, id, dto.body);
  }

  @Sse(':id/stream')
  stream(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Observable<MessageEvent>> {
    return this.chats.stream(user.id, id);
  }
}
