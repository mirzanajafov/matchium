import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CHAT_CHANNEL } from '../common/db-events.js';
import type { ReportOutcome } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 50;
const EVIDENCE_MESSAGES = 50;
const person = {
  select: {
    id: true,
    displayName: true,
    email: true,
    createdAt: true,
    bannedAt: true,
    photos: { select: { id: true }, orderBy: { createdAt: 'asc' } },
    _count: { select: { reportsAgainst: true } },
  },
} as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async reports(status: 'open' | 'reviewed') {
    const rows = await this.prisma.report.findMany({
      where: { reviewedAt: status === 'open' ? null : { not: null } },
      orderBy: { createdAt: status === 'open' ? 'asc' : 'desc' },
      take: PAGE_SIZE,
      include: {
        reporter: person,
        reported: person,
        match: {
          select: {
            day: true,
            messages: { orderBy: { createdAt: 'desc' }, take: EVIDENCE_MESSAGES },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      outcome: row.outcome,
      matchedOn: row.match.day.toISOString().slice(0, 10),
      reporter: this.person(row.reporter),
      reported: this.person(row.reported),
      messages: row.match.messages.reverse().map((m) => ({
        from: m.senderId === row.reportedId ? 'reported' : 'reporter',
        body: m.body,
        sentAt: m.createdAt.toISOString(),
      })),
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

      const userId = report.reportedId;
      await tx.user.update({ where: { id: userId }, data: { bannedAt: now } });
      await tx.report.updateMany({
        where: { reportedId: userId, reviewedAt: null },
        data: { reviewedAt: now, reviewedBy: adminId, outcome: 'BANNED' },
      });
      await tx.pushSubscription.deleteMany({ where: { userId } });
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

  private person(p: {
    id: string;
    displayName: string;
    email: string;
    createdAt: Date;
    bannedAt: Date | null;
    photos: { id: string }[];
    _count: { reportsAgainst: number };
  }) {
    return {
      id: p.id,
      displayName: p.displayName,
      email: p.email,
      joinedAt: p.createdAt.toISOString(),
      banned: p.bannedAt !== null,
      reportsAgainst: p._count.reportsAgainst,
      photos: p.photos.map((photo) => photo.id),
    };
  }
}
