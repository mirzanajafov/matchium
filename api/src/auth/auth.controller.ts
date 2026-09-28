import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../limits/rate-limit.decorator.js';
import { AuthService } from './auth.service.js';
import { ForgotPasswordDto, ResetPasswordDto, TokenDto } from './dto/account.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { Public } from './public.decorator.js';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @RateLimit({ name: 'register', by: 'ip', limit: 5, windowSeconds: 3600 })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @RateLimit(
    { name: 'login', by: 'email', limit: 10, windowSeconds: 900 },
    { name: 'login', by: 'ip', limit: 30, windowSeconds: 900 },
  )
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: TokenDto) {
    await this.auth.verifyEmail(dto.token);
    return { verified: true };
  }

  @Post('password/forgot')
  @HttpCode(204)
  @RateLimit(
    { name: 'forgot', by: 'email', limit: 3, windowSeconds: 3600 },
    { name: 'forgot', by: 'ip', limit: 10, windowSeconds: 3600 },
  )
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
  }

  @Post('password/reset')
  @HttpCode(204)
  @RateLimit({ name: 'reset', by: 'ip', limit: 10, windowSeconds: 3600 })
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }
}
