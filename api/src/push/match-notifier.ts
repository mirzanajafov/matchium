import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription, concatMap, from, map, merge } from 'rxjs';
import { Clock, isoDay, utcDay } from '../common/clock.js';
import { DbEvents, MATCHES_CHANNEL } from '../common/db-events.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from './push.service.js';

interface MatchesReady {
  day: string;
}

@Injectable()
export class MatchNotifier implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MatchNotifier.name);
  private subscription?: Subscription;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DbEvents,
    private readonly push: PushService,
    private readonly clock: Clock,
  ) {}

  onModuleInit() {
    const today = () => isoDay(utcDay(this.clock.now()));
    this.subscription = merge(
      from([today()]),
      this.events.reconnected.pipe(map(today)),
      this.events.on<MatchesReady>(MATCHES_CHANNEL).pipe(map((event) => event.day)),
    )
      .pipe(concatMap((day) => this.deliver(day).catch((error: Error) => this.fail(day, error))))
      .subscribe();
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  async deliver(day: string): Promise<number> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0;
    const claimed = await this.prisma.$queryRaw<{ userId: string; count: number }[]>`
      WITH claimed AS (
        UPDATE "Match" SET "notifiedAt" = now()
        WHERE day = ${day}::date AND "notifiedAt" IS NULL
        RETURNING "userAId", "userBId"
      )
      SELECT person::text AS "userId", count(*)::int AS count
      FROM claimed, unnest(ARRAY["userAId", "userBId"]) AS person
      GROUP BY person`;

    await Promise.all(
      claimed.map(({ userId, count }) =>
        this.push.notify(userId, {
          title: 'Your matches are here',
          body: count === 1 ? 'You have a new match today.' : `You have ${count} new matches today.`,
          url: '/today',
          tag: 'matches',
        }),
      ),
    );
    return claimed.length;
  }

  private fail(day: string, error: Error): number {
    this.log.warn(`Could not send match notifications for ${day}: ${error.message}`);
    return 0;
  }
}
