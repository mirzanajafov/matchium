import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { DecisionDto } from './dto/decision.dto.js';
import { MatchesService } from './matches.service.js';

@ApiTags('matches')
@ApiBearerAuth()
@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.matches.today(user.id);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    return this.matches.decide(user.id, id, dto.like);
  }
}
