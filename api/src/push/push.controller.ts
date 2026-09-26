import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { SubscriptionDto, UnsubscribeDto } from './dto/subscription.dto.js';
import { PushService } from './push.service.js';

@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Public()
  @Get('key')
  key() {
    return { publicKey: this.push.publicKey };
  }

  @ApiBearerAuth()
  @Post('subscriptions')
  @HttpCode(204)
  async subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscriptionDto) {
    await this.push.subscribe(user.id, dto);
  }

  @ApiBearerAuth()
  @Delete('subscriptions')
  @HttpCode(204)
  async unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
    await this.push.unsubscribe(user.id, dto.endpoint);
  }
}
