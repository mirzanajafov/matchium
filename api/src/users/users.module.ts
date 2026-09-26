import { Module } from '@nestjs/common';
import { AccountService } from './account.service.js';
import { UsersController } from './users.controller.js';

@Module({
  controllers: [UsersController],
  providers: [AccountService],
})
export class UsersModule {}
