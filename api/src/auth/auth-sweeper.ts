import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SIGNUP_LIFETIME_DAYS } from './purpose-tokens.js';
import { SESSION_LIFETIME_DAYS } from './sessions.js';

const SWEEP_EVERY_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REVOKED_KEEP_MS = DAY_MS;

@Injectable()
export class AuthSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AuthSweeper.name);
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

  async sweep(): Promise<{ sessions: number; signups: number }> {
    const now = this.clock.now().getTime();
    const [sessions, signups] = await Promise.all([
      this.deleted(
        'sessions',
        this.prisma.session.deleteMany({
          where: {
            OR: [
              { revokedAt: { lt: new Date(now - REVOKED_KEEP_MS) } },
              { createdAt: { lt: new Date(now - (SESSION_LIFETIME_DAYS + 1) * DAY_MS) } },
            ],
          },
        }),
      ),
      this.deleted(
        'pending sign-ups',
        this.prisma.pendingSignup.deleteMany({
          where: { requestedAt: { lt: new Date(now - SIGNUP_LIFETIME_DAYS * DAY_MS) } },
        }),
      ),
    ]);
    return { sessions, signups };
  }

  private async deleted(what: string, deleting: Promise<{ count: number }>): Promise<number> {
    try {
      return (await deleting).count;
    } catch (error) {
      this.log.warn(`Sweeping ${what} failed: ${(error as Error).message}`);
      return 0;
    }
  }
}
