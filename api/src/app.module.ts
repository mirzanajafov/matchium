import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { validateEnv } from './config/env.js';
import { HealthController } from './health.controller.js';
import { MatchesModule } from './matches/matches.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QuestionsModule } from './questions/questions.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
    CommonModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    QuestionsModule,
    MatchesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
