import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Clock, ageOn, isoDay, utcDay } from '../common/clock.js';
import { publish } from '../common/db-events.js';
import type { Match } from '../generated/prisma/client.js';
import { photoRefs, photoSelect } from '../photos/photos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import type { ReportDto } from './dto/unmatch.dto.js';
import { counterpart, decisionOf, involving, isMutual, isParticipant, otherUserId } from './participants.js';

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
      where: { day, closedAt: null, ...involving(userId) },
      include: { userA: publicProfile, userB: publicProfile, decisions: true },
      orderBy: { score: 'desc' },
    });

    return {
      day: isoDay(day),
      matches: matches.map((match) => {
        const person = counterpart(match, userId);
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
          decision: decisionOf(match.decisions, userId),
          mutual: isMutual(match),
        };
      }),
    };
  }

  async decide(userId: string, matchId: string, like: boolean) {
    const { match, earlier } = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Pick<Match, 'userAId' | 'userBId'>[]>`
        SELECT "userAId", "userBId" FROM "Match"
        WHERE id = ${matchId}::uuid AND "closedAt" IS NULL AND ${userId}::uuid IN ("userAId", "userBId")
        FOR NO KEY UPDATE`;
      if (!row) throw new NotFoundException('Match not found');
      const decisions = await tx.matchDecision.findMany({ where: { matchId } });
      if (decisions.some((d) => d.userId === userId)) {
        throw new ConflictException('You already decided on this match');
      }
      await tx.matchDecision.create({ data: { matchId, userId, liked: like } });
      return { match: row, earlier: decisions };
    });
    const otherId = otherUserId(match, userId);
    const mutual = like && decisionOf(earlier, otherId) === 'LIKE';
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
    if (!match || !isParticipant(match, userId)) throw new NotFoundException('Match not found');
    const otherId = otherUserId(match, userId);

    await this.prisma.$transaction(async (tx) => {
      const closed = await tx.match.updateMany({
        where: { id: matchId, closedAt: null },
        data: { closedAt: this.clock.now(), closedById: userId },
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
            note: report.note ?? null,
            reportedName: reported.displayName,
            reportedEmail: reported.email,
            evidence,
          },
          update: { reason: report.reason, note: report.note ?? null },
        });
      }
      if (closed.count > 0) await publish(tx, 'chat_messages', { matchId, closed: true });
    });
    return { closed: true, reported: Boolean(report) };
  }
}
