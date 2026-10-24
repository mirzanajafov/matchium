import { Injectable } from '@nestjs/common';
import { ChatsService } from '../chats/chats.service.js';
import { Clock, utcDay } from '../common/clock.js';
import { Mailer } from '../mail/mailer.js';
import { involving } from '../matches/participants.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
  ) {}

  async summary(userId: string) {
    const day = utcDay(this.clock.now());
    const [newMatches, unreadChats, user] = await Promise.all([
      this.prisma.match.count({
        where: { day, closedAt: null, ...involving(userId), decisions: { none: { userId } } },
      }),
      this.chats.unreadCount(userId),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerifiedAt: true } }),
    ]);
    return {
      newMatches,
      unreadChats,
      emailVerified: user.emailVerifiedAt !== null,
      emailEnabled: this.mailer.enabled,
    };
  }
}
