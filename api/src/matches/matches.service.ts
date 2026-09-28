import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Clock, ageOn, isoDay, utcDay } from '../common/clock.js';
import { CHAT_CHANNEL } from '../common/db-events.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { photoRefs, photoSelect } from '../photos/photos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import type { ReportDto } from './dto/unmatch.dto.js';

const EVIDENCE_MESSAGES = 50;
const publicProfile = {
  select: { id: true, displayName: true, birthDate: true, city: true, bio: true, photos: photoSelect },
} as const;

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly push: PushService,
  ) {}

  async today(userId: string) {
    const now = this.clock.now();
    const day = utcDay(now);
    const matches = await this.prisma.match.findMany({
      where: { day, closedAt: null, OR: [{ userAId: userId }, { userBId: userId }] },
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
            bio: person.bio ?? '',
            photos: photoRefs(person.photos),
          },
          decision: mine ? (mine.liked ? 'LIKE' : 'PASS') : null,
          mutual: Boolean(mine?.liked && theirs?.liked),
        };
      }),
    };
  }

  async decide(userId: string, matchId: string, like: boolean) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId }, include: { decisions: true } });
    if (!match || match.closedAt || (match.userAId !== userId && match.userBId !== userId)) {
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
    const mutual = like && Boolean(theirs?.liked);
    if (mutual) {
      const me = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });
      this.push.notifyInBackground(otherId, {
        title: "It's mutual",
        body: `You and ${me.displayName} both said yes. Say hi.`,
        url: `/chats/${matchId}`,
        tag: `mutual-${matchId}`,
      });
    }
    return { mutual };
  }

  async unmatch(userId: string, matchId: string, report?: ReportDto) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found');
    }
    const otherId = match.userAId === userId ? match.userBId : match.userAId;

    await this.prisma.$transaction(async (tx) => {
      const closed = await tx.match.updateMany({
        where: { id: matchId, closedAt: null },
        data: { closedAt: new Date(), closedById: userId },
      });
      if (report) {
        const [reported, messages] = await Promise.all([
          tx.user.findUniqueOrThrow({ where: { id: otherId }, select: { displayName: true, email: true } }),
          tx.message.findMany({ where: { matchId }, orderBy: { createdAt: 'desc' }, take: EVIDENCE_MESSAGES }),
        ]);
        const evidence = messages.reverse().map((m) => ({
          from: m.senderId === otherId ? 'reported' : 'reporter',
          body: m.body,
          sentAt: m.createdAt.toISOString(),
        }));
        await tx.report.upsert({
          where: { matchId_reporterId: { matchId, reporterId: userId } },
          create: {
            matchId,
            reporterId: userId,
            reportedId: otherId,
            reason: report.reason,
            note: report.note,
            reportedName: reported.displayName,
            reportedEmail: reported.email,
            evidence,
          },
          update: { reason: report.reason, note: report.note ?? null },
        });
      }
      if (closed.count > 0) {
        await tx.$executeRaw`SELECT pg_notify(${CHAT_CHANNEL}, ${JSON.stringify({ matchId, closed: true })})`;
      }
    });
    return { closed: true, reported: Boolean(report) };
  }
}
