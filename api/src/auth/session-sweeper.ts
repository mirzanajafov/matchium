import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';

const SWEEP_EVERY_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REVOKED_KEEP_MS = DAY_MS;
const TOKEN_LIFETIME_MS = 7 * DAY_MS;

@Injectable()
export class SessionSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SessionSweeper.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async sweep(): Promise<number> {
    const now = this.clock.now().getTime();
    try {
      const { count } = await this.prisma.session.deleteMany({
        where: {
          OR: [
            { revokedAt: { lt: new Date(now - REVOKED_KEEP_MS) } },
            { createdAt: { lt: new Date(now - TOKEN_LIFETIME_MS - DAY_MS) } },
          ],
        },
      });
      return count;
    } catch (error) {
      this.log.warn(`Session sweep failed: ${(error as Error).message}`);
      return 0;
    }
  }
}
