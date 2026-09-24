import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Clock, ageOn, isoDay } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';

const publicProfile = { select: { id: true, displayName: true, birthDate: true, city: true } } as const;
const PAGE_SIZE = 200;

interface MatchParticipants {
  userAId: string;
  userBId: string;
  decisions: { userId: string; liked: boolean }[];
}

interface MessageRow {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
}

function isMutual(match: MatchParticipants): boolean {
  const liked = new Set(match.decisions.filter((d) => d.liked).map((d) => d.userId));
  return liked.has(match.userAId) && liked.has(match.userBId);
}

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(userId: string) {
    const matches = await this.mutualMatches(userId);
    const now = this.clock.now();
    const activity = (match: (typeof matches)[number]) =>
      (match.messages[0]?.createdAt ?? match.createdAt).getTime();

    return matches
      .filter(isMutual)
      .sort((a, b) => activity(b) - activity(a))
      .map((match) => {
        const person = match.userAId === userId ? match.userB : match.userA;
        const last = match.messages[0];
        return {
          id: match.id,
          matchedOn: isoDay(match.day),
          person: { id: person.id, displayName: person.displayName, age: ageOn(person.birthDate, now), city: person.city },
          lastMessage: last ? this.toMessage(last, userId) : null,
          unread: this.isUnread(match, userId),
        };
      });
  }

  async unreadCount(userId: string): Promise<number> {
    const matches = await this.mutualMatches(userId);
    return matches.filter((match) => isMutual(match) && this.isUnread(match, userId)).length;
  }

  async messages(userId: string, matchId: string, after?: string) {
    const match = await this.openChat(userId, matchId);
    const person = match.userAId === userId ? match.userB : match.userA;
    const rows = await this.prisma.message.findMany({
      where: { matchId, ...(after ? { createdAt: { gte: new Date(after) } } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: PAGE_SIZE,
    });
    await this.markRead(matchId, userId);
    return {
      person: { id: person.id, displayName: person.displayName },
      messages: rows.map((row) => this.toMessage(row, userId)),
    };
  }

  async send(userId: string, matchId: string, body: string) {
    await this.openChat(userId, matchId);
    const row = await this.prisma.message.create({ data: { matchId, senderId: userId, body } });
    await this.markRead(matchId, userId);
    return this.toMessage(row, userId);
  }

  private mutualMatches(userId: string) {
    return this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }], decisions: { some: { liked: true } } },
      include: {
        decisions: true,
        userA: publicProfile,
        userB: publicProfile,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        reads: { where: { userId } },
      },
    });
  }

  private isUnread(match: { messages: MessageRow[]; reads: { readAt: Date }[] }, userId: string): boolean {
    const read = match.reads[0];
    if (!read) return true;
    const last = match.messages[0];
    return Boolean(last && last.senderId !== userId && last.createdAt > read.readAt);
  }

  private async markRead(matchId: string, userId: string) {
    await this.prisma.$executeRaw`
      INSERT INTO "ChatRead" ("matchId", "userId", "readAt") VALUES (${matchId}::uuid, ${userId}::uuid, now())
      ON CONFLICT ("matchId", "userId") DO UPDATE SET "readAt" = now()`;
  }

  private async openChat(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { decisions: true, userA: publicProfile, userB: publicProfile },
    });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Chat not found');
    }
    if (!isMutual(match)) throw new ForbiddenException('You can chat once you both said yes');
    return match;
  }

  private toMessage(row: MessageRow, userId: string) {
    return { id: row.id, body: row.body, fromMe: row.senderId === userId, createdAt: row.createdAt.toISOString() };
  }
}
