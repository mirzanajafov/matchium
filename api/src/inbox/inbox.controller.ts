import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ChatsService } from '../chats/chats.service.js';
import { Clock, utcDay } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('inbox')
@ApiBearerAuth()
@Controller('inbox')
export class InboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly clock: Clock,
  ) {}

  @Get()
  async summary(@CurrentUser() { id }: AuthUser) {
    const day = utcDay(this.clock.now());
    const [newMatches, unreadChats] = await Promise.all([
      this.prisma.match.count({
        where: { day, OR: [{ userAId: id }, { userBId: id }], decisions: { none: { userId: id } } },
      }),
      this.chats.unreadCount(id),
    ]);
    return { newMatches, unreadChats };
  }
}
