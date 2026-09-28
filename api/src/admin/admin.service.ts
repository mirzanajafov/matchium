import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CHAT_CHANNEL } from '../common/db-events.js';
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

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
      matchedOn: row.match?.day.toISOString().slice(0, 10) ?? null,
      reporter: row.reporter ? this.account(row.reporter) : this.gone('Deleted account', ''),
      reported: {
        ...(row.reported ? this.account(row.reported) : this.gone(row.reportedName, row.reportedEmail)),
        banned: row.reported ? row.reported.bannedAt !== null : row.outcome === 'BANNED',
        reportsAgainst: against.get(row.reportedEmail) ?? 1,
      },
      messages: row.evidence as unknown as Evidence[],
    }));
  }

  async resolve(adminId: string, reportId: string, outcome: ReportOutcome) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.reviewedAt) throw new ConflictException('This report was already reviewed');

    const now = new Date();
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
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      const open = await tx.match.findMany({
        where: { closedAt: null, OR: [{ userAId: userId }, { userBId: userId }] },
        select: { id: true },
      });
      await tx.match.updateMany({
        where: { id: { in: open.map((m) => m.id) } },
        data: { closedAt: now, closedById: adminId },
      });
      for (const { id } of open) {
        await tx.$executeRaw`SELECT pg_notify(${CHAT_CHANNEL}, ${JSON.stringify({ matchId: id, closed: true })})`;
      }
      return open;
    });
    return { outcome, closedMatches: closedMatches.length };
  }

  private account(p: Account) {
    return {
      id: p.id as string | null,
      displayName: p.displayName,
      email: p.email,
      joinedAt: p.createdAt.toISOString() as string | null,
      deleted: false,
      banned: p.bannedAt !== null,
      reportsAgainst: 0,
      photos: p.photos.map((photo) => photo.id),
    };
  }

  private gone(displayName: string, email: string) {
    return {
      id: null,
      displayName,
      email,
      joinedAt: null,
      deleted: true,
      banned: false,
      reportsAgainst: 0,
      photos: [] as string[],
    };
  }
}
