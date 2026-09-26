import { ForbiddenException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { beliefState } from '../common/belief-row.js';
import { Clock, isoDay } from '../common/clock.js';
import { DIMENSIONS } from '../engine/belief.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async export(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        belief: true,
        answers: { include: { question: { select: { text: true } } }, orderBy: { answeredAt: 'asc' } },
        matchesAsA: { include: { userB: { select: { displayName: true } }, decisions: true } },
        matchesAsB: { include: { userA: { select: { displayName: true } }, decisions: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        reportsMade: { orderBy: { createdAt: 'asc' } },
        pushes: { select: { endpoint: true, createdAt: true } },
      },
    });

    const matches = [
      ...user.matchesAsA.map((m) => ({ ...m, person: m.userB.displayName })),
      ...user.matchesAsB.map((m) => ({ ...m, person: m.userA.displayName })),
    ].sort((a, b) => a.day.getTime() - b.day.getTime());
    const decisionOf = (decisions: { userId: string; liked: boolean }[], id: string) => {
      const found = decisions.find((d) => d.userId === id);
      return found ? (found.liked ? 'LIKE' : 'PASS') : null;
    };

    return {
      exportedAt: this.clock.now().toISOString(),
      profile: {
        email: user.email,
        displayName: user.displayName,
        birthDate: isoDay(user.birthDate),
        gender: user.gender,
        seeking: user.seeking,
        city: user.city,
        joinedAt: user.createdAt.toISOString(),
      },
      answers: user.answers.map((a) => ({
        question: a.question.text,
        you: a.self,
        partner: a.partner,
        importance: a.importance,
        answeredAt: a.answeredAt.toISOString(),
      })),
      model: user.belief ? this.model(user.belief) : null,
      matches: matches.map((m) => {
        const other = m.userAId === userId ? m.userBId : m.userAId;
        return {
          day: isoDay(m.day),
          with: m.person,
          score: m.score,
          yourDecision: decisionOf(m.decisions, userId),
          mutual: decisionOf(m.decisions, userId) === 'LIKE' && decisionOf(m.decisions, other) === 'LIKE',
          closed: m.closedAt !== null,
        };
      }),
      messagesSent: user.messages.map((m) => ({ matchId: m.matchId, body: m.body, sentAt: m.createdAt.toISOString() })),
      reportsMade: user.reportsMade.map((r) => ({ reason: r.reason, note: r.note, madeAt: r.createdAt.toISOString() })),
      pushDevices: user.pushes.map((p) => ({ service: new URL(p.endpoint).host, addedAt: p.createdAt.toISOString() })),
    };
  }

  async delete(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (!(await argon2.verify(user.passwordHash, password))) throw new ForbiddenException('Wrong password');
    await this.prisma.user.delete({ where: { id: userId } });
  }

  private model(row: Parameters<typeof beliefState>[0] & { muGap: number[] }) {
    const state = beliefState(row);
    return Object.fromEntries(
      DIMENSIONS.map((dimension, k) => [
        dimension,
        {
          you: round(state.muSelf[k]),
          youWant: round((state.muPref[k] ?? 0) + (row.muGap[k] ?? 0)),
          importance: round(2 ** ((state.logWSum[k] ?? 0) / (state.logWCount[k] ?? 1))),
        },
      ]),
    );
  }
}

function round(value: number | undefined): number {
  return Math.round((value ?? 0) * 1000) / 1000;
}
