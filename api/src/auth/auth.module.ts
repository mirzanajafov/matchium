import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import { MailModule } from '../mail/mail.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionController } from './session.controller.js';
import { AuthSweeper } from './auth-sweeper.js';
import { SESSION_LIFETIME_DAYS } from './sessions.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: `${SESSION_LIFETIME_DAYS}d` },
      }),
    }),
    MailModule,
  ],
  controllers: [AuthController, SessionController],
  providers: [AuthService, AuthSweeper],
})
export class AuthModule {}
