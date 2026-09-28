import { Body, Controller, Delete, Get, HttpCode, Header, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { beliefState } from '../common/belief-row.js';
import { isoDay } from '../common/clock.js';
import { certainty } from '../engine/belief.js';
import { preferenceShifts } from '../engine/revealed.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountService } from './account.service.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { PreferencesDto } from './dto/preferences.dto.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly account: AccountService,
  ) {}

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
      role: user.role,
      emailDigest: user.emailDigest,
      emailVerified: user.emailVerifiedAt !== null,
      answerCount: user.belief?.answerCount ?? 0,
      certainty: user.belief ? Number(certainty(beliefState(user.belief)).toFixed(3)) : 0,
      decisionsLearned,
      preferenceShifts: preferenceShifts(user.belief?.muGap ?? []),
    };
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  export(@CurrentUser() { id }: AuthUser) {
    return this.account.export(id);
  }

  @Patch('preferences')
  async preferences(@CurrentUser() { id }: AuthUser, @Body() dto: PreferencesDto) {
    const user = await this.prisma.user.update({ where: { id }, data: { emailDigest: dto.emailDigest } });
    return { emailDigest: user.emailDigest };
  }

  @Delete()
  @HttpCode(204)
  async remove(@CurrentUser() { id }: AuthUser, @Body() dto: DeleteAccountDto) {
    await this.account.delete(id, dto.password);
  }
}
