import { ForbiddenException, Injectable, MessageEvent, NotFoundException } from '@nestjs/common';
import { Observable, concatMap, filter, interval, map, merge, takeWhile } from 'rxjs';
import { Clock, ageOn, isoDay } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { CHAT_CHANNEL, DbEvents } from '../common/db-events.js';

const publicProfile = { select: { id: true, displayName: true, birthDate: true, city: true } } as const;
const PAGE_SIZE = 200;
const HEARTBEAT_MS = 25_000;
const PREVIEW_LENGTH = 120;

export interface ChatEvent {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

interface ClosedEvent {
  matchId: string;
  closed: true;
}

function isClosed(event: ChatEvent | ClosedEvent): event is ClosedEvent {
  return 'closed' in event;
}

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
    private readonly events: DbEvents,
    private readonly push: PushService,
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
    const match = await this.openChat(userId, matchId);
    const row = await this.prisma.message.create({ data: { matchId, senderId: userId, body } });
    await this.markRead(matchId, userId);
    const event: ChatEvent = { ...row, createdAt: row.createdAt.toISOString() };
    await this.prisma.$executeRaw`SELECT pg_notify(${CHAT_CHANNEL}, ${JSON.stringify(event)})`;
    const [sender, recipient] = match.userAId === userId ? [match.userA, match.userB] : [match.userB, match.userA];
    this.push.notifyInBackground(recipient.id, {
      title: sender.displayName,
      body: body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH - 1)}…` : body,
      url: `/chats/${matchId}`,
      tag: `chat-${matchId}`,
    });
    return this.toMessage(row, userId);
  }

  async stream(userId: string, matchId: string): Promise<Observable<MessageEvent>> {
    await this.openChat(userId, matchId);
    const messages = this.events.on<ChatEvent | ClosedEvent>(CHAT_CHANNEL).pipe(
      filter((event) => event.matchId === matchId),
      concatMap(async (event): Promise<MessageEvent> => {
        if (isClosed(event)) return { type: 'closed', data: '' };
        if (event.senderId !== userId) await this.markRead(matchId, userId);
        return { type: 'message', data: this.toMessage({ ...event, createdAt: new Date(event.createdAt) }, userId) };
      }),
    );
    const heartbeat = interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: '' })));
    return merge(messages, heartbeat).pipe(takeWhile((event) => event.type !== 'closed', true));
  }

  private mutualMatches(userId: string) {
    return this.prisma.match.findMany({
      where: { closedAt: null, OR: [{ userAId: userId }, { userBId: userId }], decisions: { some: { liked: true } } },
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
    if (!match || match.closedAt || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Chat not found');
    }
    if (!isMutual(match)) throw new ForbiddenException('You can chat once you both said yes');
    return match;
  }

  private toMessage(row: MessageRow, userId: string) {
    return { id: row.id, body: row.body, fromMe: row.senderId === userId, createdAt: row.createdAt.toISOString() };
  }
}
