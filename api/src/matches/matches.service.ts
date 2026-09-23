import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Clock, ageOn, isoDay, utcDay } from '../common/clock.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

const publicProfile = { select: { id: true, displayName: true, birthDate: true, city: true } } as const;

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async today(userId: string) {
    const now = this.clock.now();
    const day = utcDay(now);
    const matches = await this.prisma.match.findMany({
      where: { day, OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: publicProfile, userB: publicProfile, decisions: true },
      orderBy: { score: 'desc' },
    });

    return {
      day: isoDay(day),
      matches: matches.map((match) => {
        const person = match.userAId === userId ? match.userB : match.userA;
        const mine = match.decisions.find((d) => d.userId === userId);
        const theirs = match.decisions.find((d) => d.userId === person.id);
        return {
          id: match.id,
          score: match.score,
          confidence: match.confidence,
          aligned: match.aligned,
          friction: match.friction,
          person: {
            id: person.id,
            displayName: person.displayName,
            age: ageOn(person.birthDate, now),
            city: person.city,
          },
          decision: mine ? (mine.liked ? 'LIKE' : 'PASS') : null,
          mutual: Boolean(mine?.liked && theirs?.liked),
        };
      }),
    };
  }

  async decide(userId: string, matchId: string, like: boolean) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId }, include: { decisions: true } });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found');
    }
    try {
      await this.prisma.matchDecision.create({ data: { matchId, userId, liked: like } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('You already decided on this match');
      throw error;
    }
    const otherId = match.userAId === userId ? match.userBId : match.userAId;
    const theirs = match.decisions.find((d) => d.userId === otherId);
    return { mutual: like && Boolean(theirs?.liked) };
  }
}
