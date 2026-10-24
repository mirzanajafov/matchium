import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { ChatsModule } from './chats/chats.module.js';
import { CommonModule } from './common/common.module.js';
import { validateEnv } from './config/env.js';
import { HealthController } from './health.controller.js';
import { InboxModule } from './inbox/inbox.module.js';
import { LimitsModule } from './limits/limits.module.js';
import { RateLimitGuard } from './limits/rate-limit.guard.js';
import { MatchesModule } from './matches/matches.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { MetricsController } from './observability/metrics.controller.js';
import { PhotosModule } from './photos/photos.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PushModule } from './push/push.module.js';
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
    LimitsModule,
    AuthModule,
    UsersModule,
    PhotosModule,
    QuestionsModule,
    MatchesModule,
    ChatsModule,
    InboxModule,
    PushModule,
    NotificationsModule,
    AdminModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
