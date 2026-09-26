import { SetMetadata } from '@nestjs/common';

export type LimitKey = 'ip' | 'user' | 'email';

export interface LimitRule {
  name: string;
  by: LimitKey;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = 'rateLimits';

export const RateLimit = (...rules: LimitRule[]) => SetMetadata(RATE_LIMITS, rules);
