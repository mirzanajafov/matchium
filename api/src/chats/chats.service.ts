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
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }], decisions: { some: { liked: true } } },
      include: {
        decisions: true,
        userA: publicProfile,
        userB: publicProfile,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
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
        };
      });
  }

  async messages(userId: string, matchId: string, after?: string) {
    const match = await this.openChat(userId, matchId);
    const person = match.userAId === userId ? match.userB : match.userA;
    const rows = await this.prisma.message.findMany({
      where: { matchId, ...(after ? { createdAt: { gte: new Date(after) } } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: PAGE_SIZE,
    });
    return {
      person: { id: person.id, displayName: person.displayName },
      messages: rows.map((row) => this.toMessage(row, userId)),
    };
  }

  async send(userId: string, matchId: string, body: string) {
    await this.openChat(userId, matchId);
    const row = await this.prisma.message.create({ data: { matchId, senderId: userId, body } });
    return this.toMessage(row, userId);
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
