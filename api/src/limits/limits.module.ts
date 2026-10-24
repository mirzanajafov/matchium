import { Module } from '@nestjs/common';
import { RateLimiter } from './rate-limiter.js';

@Module({
  providers: [RateLimiter],
  exports: [RateLimiter],
})
export class LimitsModule {}
