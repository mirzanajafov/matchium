import { Module } from '@nestjs/common';
import { PhotosModule } from '../photos/photos.module.js';
import { AccountService } from './account.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [PhotosModule],
  controllers: [UsersController],
  providers: [UsersService, AccountService],
})
export class UsersModule {}
