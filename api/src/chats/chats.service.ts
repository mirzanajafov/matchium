import { ForbiddenException, Injectable, MessageEvent, NotFoundException } from '@nestjs/common';
import { Observable, concatMap, defer, filter, finalize, interval, map, merge, takeUntil, takeWhile } from 'rxjs';
import { Clock, ageOn, isoDay } from '../common/clock.js';
import { photoSelect } from '../photos/photos.service.js';
import { openStreams } from '../observability/metrics.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { counterpart, involving, isMutual, isParticipant } from '../matches/participants.js';
import { type ChatMessageEvent, DbEvents, isClosed, publish } from '../common/db-events.js';

const publicProfile = {
  select: { id: true, displayName: true, birthDate: true, city: true, photos: { ...photoSelect, take: 1 } },
} as const;
const PAGE_SIZE = 200;
const HEARTBEAT_MS = 25_000;
const PREVIEW_LENGTH = 120;

interface MessageRow {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
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
    const activity = (match: (typeof matches)[number]) => (match.messages[0]?.createdAt ?? match.createdAt).getTime();

    return matches
      .filter(isMutual)
      .sort((a, b) => activity(b) - activity(a))
      .map((match) => {
        const person = counterpart(match, userId);
        const last = match.messages[0];
        return {
          id: match.id,
          matchedOn: isoDay(match.day),
          person: {
            id: person.id,
            displayName: person.displayName,
            age: ageOn(person.birthDate, now),
            city: person.city,
            photo: person.photos[0]?.id ?? null,
          },
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
    const person = counterpart(match, userId);
    const rows = await this.prisma.message.findMany({
      where: { matchId, ...(after ? { createdAt: { gte: new Date(after) } } : {}) },
      orderBy: after ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE,
    });
    if (!after) rows.reverse();
    await this.markRead(matchId, userId);
    return {
      person: { id: person.id, displayName: person.displayName, photo: person.photos[0]?.id ?? null },
      messages: rows.map((row) => this.toMessage(row, userId)),
    };
  }

  async send(userId: string, matchId: string, body: string) {
    const match = await this.openChat(userId, matchId);
    const [row] = await this.prisma.$queryRaw<(MessageRow & { matchId: string })[]>`
      INSERT INTO "Message" (id, "matchId", "senderId", body)
      SELECT gen_random_uuid(), id, ${userId}::uuid, ${body} FROM "Match"
      WHERE id = ${matchId}::uuid AND "closedAt" IS NULL
      FOR SHARE
      RETURNING id, "matchId", "senderId", body, "createdAt"`;
    if (!row) throw new NotFoundException('Chat not found');
    await this.markRead(matchId, userId);
    const event: ChatMessageEvent = { ...row, createdAt: row.createdAt.toISOString() };
    await publish(this.prisma, 'chat_messages', event);
    const recipient = counterpart(match, userId);
    const sender = counterpart(match, recipient.id);
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
    const messages = this.events.on('chat_messages').pipe(
      filter((event) => event.matchId === matchId),
      concatMap(async (event): Promise<MessageEvent> => {
        if (isClosed(event)) return { type: 'closed', data: '' };
        if (event.senderId !== userId) await this.markRead(matchId, userId);
        return { type: 'message', data: this.toMessage({ ...event, createdAt: new Date(event.createdAt) }, userId) };
      }),
    );
    const closedMeanwhile = defer(() => this.chatClosed(matchId)).pipe(
      filter(Boolean),
      map((): MessageEvent => ({ type: 'closed', data: '' })),
    );
    const heartbeat = interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: '' })));
    const stream = merge(messages, closedMeanwhile, heartbeat).pipe(
      takeUntil(this.events.stopped),
      takeWhile((event) => event.type !== 'closed', true),
    );
    return defer(() => {
      openStreams.inc();
      return stream.pipe(finalize(() => openStreams.dec()));
    });
  }

  private mutualMatches(userId: string) {
    return this.prisma.match.findMany({
      where: { closedAt: null, ...involving(userId), decisions: { some: { liked: true } } },
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
    if (!match || match.closedAt || !isParticipant(match, userId)) {
      throw new NotFoundException('Chat not found');
    }
    if (!isMutual(match)) throw new ForbiddenException('You can chat once you both said yes');
    return match;
  }

  private async chatClosed(matchId: string): Promise<boolean> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId }, select: { closedAt: true } });
    return !match || match.closedAt !== null;
  }

  private toMessage(row: MessageRow, userId: string) {
    return { id: row.id, body: row.body, fromMe: row.senderId === userId, createdAt: row.createdAt.toISOString() };
  }
}
