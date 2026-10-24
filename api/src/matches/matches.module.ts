import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module.js';
import { MatchesController } from './matches.controller.js';
import { MatchesService } from './matches.service.js';

@Module({
  imports: [PushModule],
  controllers: [MatchesController],
  providers: [MatchesService],
})
export class MatchesModule {}
