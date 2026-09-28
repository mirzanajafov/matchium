import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ChatsService } from '../chats/chats.service.js';
import { Clock, utcDay } from '../common/clock.js';
import { Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('inbox')
@ApiBearerAuth()
@Controller('inbox')
export class InboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
  ) {}

  @Get()
  async summary(@CurrentUser() { id }: AuthUser) {
    const day = utcDay(this.clock.now());
    const [newMatches, unreadChats, user] = await Promise.all([
      this.prisma.match.count({
        where: { day, closedAt: null, OR: [{ userAId: id }, { userBId: id }], decisions: { none: { userId: id } } },
      }),
      this.chats.unreadCount(id),
      this.prisma.user.findUniqueOrThrow({ where: { id }, select: { emailVerifiedAt: true } }),
    ]);
    return {
      newMatches,
      unreadChats,
      emailVerified: user.emailVerifiedAt !== null,
      emailEnabled: this.mailer.enabled,
    };
  }
}
