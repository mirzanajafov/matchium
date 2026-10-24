import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription, concatMap, from, map, merge } from 'rxjs';
import { Clock, isoDay, utcDay } from '../common/clock.js';
import { DbEvents } from '../common/db-events.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { DigestService } from './digest.service.js';

@Injectable()
export class MatchNotifier implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MatchNotifier.name);
  private subscription?: Subscription;
  private delivering = Promise.resolve(0);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DbEvents,
    private readonly push: PushService,
    private readonly clock: Clock,
    private readonly digest: DigestService,
  ) {}

  onModuleInit() {
    const today = () => isoDay(utcDay(this.clock.now()));
    this.subscription = merge(
      from([today()]),
      this.events.reconnected.pipe(map(today)),
      this.events.on('matches_ready').pipe(map((event) => event.day)),
    )
      .pipe(
        concatMap((day) => {
          this.delivering = this.deliver(day).catch((error: Error) => this.fail(day, error));
          return this.delivering;
        }),
      )
      .subscribe();
  }

  async onModuleDestroy() {
    this.subscription?.unsubscribe();
    await this.delivering;
  }

  async deliver(day: string): Promise<number> {
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
        this.notify(userId, count).catch((error: Error) =>
          this.log.warn(`Could not tell ${userId} about the ${day} matches: ${error.message}`),
        ),
      ),
    );
    return claimed.length;
  }

  private async notify(userId: string, count: number) {
    const pushed = await this.push.notify(userId, {
      title: 'Your matches are here',
      body: count === 1 ? 'You have a new match today.' : `You have ${count} new matches today.`,
      url: '/today',
      tag: 'matches',
    });
    if (pushed === 0) await this.digest.send(userId, count);
  }

  private fail(day: string, error: Error): number {
    this.log.warn(`Could not send match notifications for ${day}: ${error.message}`);
    return 0;
  }
}
