import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { beliefState } from '../common/belief-row.js';
import { isoDay } from '../common/clock.js';
import { certainty } from '../engine/belief.js';
import { preferenceShifts } from '../engine/revealed.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() { id }: AuthUser) {
    const [user, decisionsLearned] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id }, include: { belief: true } }),
      this.prisma.matchDecision.count({ where: { userId: id, learnedAt: { not: null } } }),
    ]);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      birthDate: isoDay(user.birthDate),
      gender: user.gender,
      seeking: user.seeking,
      city: user.city,
      answerCount: user.belief?.answerCount ?? 0,
      certainty: user.belief ? Number(certainty(beliefState(user.belief)).toFixed(3)) : 0,
      decisionsLearned,
      preferenceShifts: preferenceShifts(user.belief?.muGap ?? []),
    };
  }
}
