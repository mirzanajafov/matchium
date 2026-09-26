import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CLEANUP_EVERY_MS = 60 * 60 * 1000;
const KEEP_MS = 24 * 60 * 60 * 1000;

export interface Verdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimiter implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RateLimiter.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.cleanup(), CLEANUP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async hit(key: string, limit: number, windowSeconds: number): Promise<Verdict> {
    const now = this.clock.now().getTime();
    const windowMs = windowSeconds * 1000;
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const [row] = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" (key, "windowStart", count) VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT (key, "windowStart") DO UPDATE SET count = "RateLimit".count + 1
      RETURNING count`;
    const count = row?.count ?? 1;
    return {
      allowed: count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)),
    };
  }

  async cleanup() {
    const cutoff = new Date(this.clock.now().getTime() - KEEP_MS);
    try {
      await this.prisma.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
    } catch (error) {
      this.log.warn(`Rate limit cleanup failed: ${(error as Error).message}`);
    }
  }
}
