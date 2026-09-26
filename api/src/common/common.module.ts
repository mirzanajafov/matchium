import { Global, Module } from '@nestjs/common';
import { Clock } from './clock.js';
import { DbEvents } from './db-events.js';

@Global()
@Module({
  providers: [Clock, DbEvents],
  exports: [Clock, DbEvents],
})
export class CommonModule {}
