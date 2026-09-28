import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../limits/rate-limit.decorator.js';
import { AuthService } from './auth.service.js';
import { type AuthUser, CurrentUser } from './current-user.decorator.js';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class SessionController {
  constructor(private readonly auth: AuthService) {}

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.sessionId);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutEverywhere(@CurrentUser() user: AuthUser) {
    await this.auth.logoutEverywhere(user.id);
  }

  @Post('verify-email/resend')
  @HttpCode(204)
  @RateLimit({ name: 'verify-resend', by: 'user', limit: 3, windowSeconds: 3600 })
  async resend(@CurrentUser() user: AuthUser) {
    await this.auth.resendVerification(user.id);
  }
}
