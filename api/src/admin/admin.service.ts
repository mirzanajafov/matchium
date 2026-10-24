import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { revokeSessions } from '../auth/sessions.js';
import { Clock, isoDay } from '../common/clock.js';
import { type ChatClosedEvent, publish } from '../common/db-events.js';
import { isRecord } from '../common/json.js';
import { involving } from '../matches/participants.js';
import type { ReportOutcome } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 50;
const person = {
  select: {
    id: true,
    displayName: true,
    email: true,
    createdAt: true,
    bannedAt: true,
    photos: { select: { id: true }, orderBy: { createdAt: 'asc' } },
  },
} as const;

interface Account {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
  bannedAt: Date | null;
  photos: { id: string }[];
}

export interface Evidence {
  from: 'reporter' | 'reported';
  body: string;
  sentAt: string;
}

export interface AccountView {
  id: string | null;
  displayName: string;
  email: string;
  joinedAt: string | null;
  deleted: boolean;
  banned: boolean;
  reportsAgainst: number;
  photos: string[];
}

function isEvidence(value: unknown): value is Evidence {
  if (!isRecord(value)) return false;
  const { from, body, sentAt } = value;
  return (from === 'reporter' || from === 'reported') && typeof body === 'string' && typeof sentAt === 'string';
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async reports(status: 'open' | 'reviewed') {
    const rows = await this.prisma.report.findMany({
      where: { reviewedAt: status === 'open' ? null : { not: null } },
      orderBy: { createdAt: status === 'open' ? 'asc' : 'desc' },
      take: PAGE_SIZE,
      include: { reporter: person, reported: person, match: { select: { day: true } } },
    });
    const counts = await this.prisma.report.groupBy({
      by: ['reportedEmail'],
      where: { reportedEmail: { in: [...new Set(rows.map((r) => r.reportedEmail))] } },
      _count: { _all: true },
    });
    const against = new Map(counts.map((c) => [c.reportedEmail, c._count._all]));

    return rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      outcome: row.outcome,
      matchedOn: row.match ? isoDay(row.match.day) : null,
      reporter: row.reporter ? this.account(row.reporter) : this.gone('Deleted account', ''),
      reported: {
        ...(row.reported ? this.account(row.reported) : this.gone(row.reportedName, row.reportedEmail)),
        banned: row.reported ? row.reported.bannedAt !== null : row.outcome === 'BANNED',
        reportsAgainst: against.get(row.reportedEmail) ?? 1,
      },
      messages: Array.isArray(row.evidence) ? row.evidence.flatMap((item) => (isEvidence(item) ? [item] : [])) : [],
    }));
  }

  async resolve(adminId: string, reportId: string, outcome: ReportOutcome) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.reviewedAt) throw new ConflictException('This report was already reviewed');

    const now = this.clock.now();
    const closedMatches = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.report.updateMany({
        where: { id: reportId, reviewedAt: null },
        data: { reviewedAt: now, reviewedBy: adminId, outcome },
      });
      if (claimed.count === 0) throw new ConflictException('This report was already reviewed');
      if (outcome !== 'BANNED') return [];

      await tx.report.updateMany({
        where: { reportedEmail: report.reportedEmail, reviewedAt: null },
        data: { reviewedAt: now, reviewedBy: adminId, outcome: 'BANNED' },
      });
      const userId = report.reportedId;
      if (!userId) return [];

      await tx.user.update({ where: { id: userId }, data: { bannedAt: now } });
      await tx.pushSubscription.deleteMany({ where: { userId } });
      await revokeSessions(tx, userId, now);
      const open = await tx.match.findMany({
        where: { closedAt: null, ...involving(userId) },
        select: { id: true },
      });
      await tx.match.updateMany({
        where: { id: { in: open.map((m) => m.id) } },
        data: { closedAt: now, closedById: adminId },
      });
      await publish(tx, 'chat_messages', ...open.map(({ id }): ChatClosedEvent => ({ matchId: id, closed: true })));
      return open;
    });
    return { outcome, closedMatches: closedMatches.length };
  }

  private account(p: Account): AccountView {
    return {
      id: p.id,
      displayName: p.displayName,
      email: p.email,
      joinedAt: p.createdAt.toISOString(),
      deleted: false,
      banned: p.bannedAt !== null,
      reportsAgainst: 0,
      photos: p.photos.map((photo) => photo.id),
    };
  }

  private gone(displayName: string, email: string): AccountView {
    return {
      id: null,
      displayName,
      email,
      joinedAt: null,
      deleted: true,
      banned: false,
      reportsAgainst: 0,
      photos: [],
    };
  }
}
