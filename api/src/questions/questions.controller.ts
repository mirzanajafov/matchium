import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { AnswerDto } from './dto/answer.dto.js';
import { QuestionsService } from './questions.service.js';

@ApiTags('questions')
@ApiBearerAuth()
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.questions.today(user.id);
  }

  @Post(':id/answer')
  answer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AnswerDto) {
    return this.questions.answer(user.id, id, dto);
  }
}
