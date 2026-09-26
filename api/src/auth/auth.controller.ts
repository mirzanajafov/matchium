import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../limits/rate-limit.decorator.js';
import { AuthService } from './auth.service.js';
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
}
