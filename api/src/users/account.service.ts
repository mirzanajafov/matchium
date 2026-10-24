import { ForbiddenException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Clock, isoDay } from '../common/clock.js';
import { toThousandths } from '../common/rounding.js';
import { type BeliefState, DIMENSIONS, entry, weights } from '../engine/belief.js';
import { decisionOf, isMutual } from '../matches/participants.js';
import { PhotosService } from '../photos/photos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly photos: PhotosService,
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
        photos: { select: { id: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
    });

    const matches = [
      ...user.matchesAsA.map((m) => ({ ...m, person: m.userB.displayName })),
      ...user.matchesAsB.map((m) => ({ ...m, person: m.userA.displayName })),
    ].sort((a, b) => a.day.getTime() - b.day.getTime());

    return {
      exportedAt: this.clock.now().toISOString(),
      profile: {
        email: user.email,
        displayName: user.displayName,
        birthDate: isoDay(user.birthDate),
        gender: user.gender,
        seeking: user.seeking,
        city: user.city,
        bio: user.bio,
        joinedAt: user.createdAt.toISOString(),
      },
      photos: user.photos.map((p) => ({ id: p.id, uploadedAt: p.createdAt.toISOString() })),
      answers: user.answers.map((a) => ({
        question: a.question.text,
        you: a.self,
        partner: a.partner,
        importance: a.importance,
        answeredAt: a.answeredAt.toISOString(),
      })),
      model: user.belief ? this.model(user.belief) : null,
      matches: matches.map((m) => ({
        day: isoDay(m.day),
        with: m.person,
        score: m.score,
        yourDecision: decisionOf(m.decisions, userId),
        mutual: isMutual(m),
        closed: m.closedAt !== null,
      })),
      messagesSent: user.messages.map((m) => ({ matchId: m.matchId, body: m.body, sentAt: m.createdAt.toISOString() })),
      reportsMade: user.reportsMade.map((r) => ({ reason: r.reason, note: r.note, madeAt: r.createdAt.toISOString() })),
      pushDevices: user.pushes.map((p) => ({ service: new URL(p.endpoint).host, addedAt: p.createdAt.toISOString() })),
    };
  }

  async delete(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (!(await argon2.verify(user.passwordHash, password))) throw new ForbiddenException('Wrong password');
    const keys = await this.prisma.$transaction(async (tx) => {
      const owned = await this.photos.lockKeys(tx, userId);
      await tx.user.delete({ where: { id: userId } });
      return owned;
    });
    await this.photos.discard(keys);
  }

  private model(state: BeliefState & { muGap: number[] }) {
    const importance = weights(state);
    return Object.fromEntries(
      DIMENSIONS.map((dimension, k) => [
        dimension,
        {
          you: toThousandths(entry(state.muSelf, k)),
          youWant: toThousandths(entry(state.muPref, k) + (state.muGap[k] ?? 0)),
          importance: toThousandths(entry(importance, k)),
        },
      ]),
    );
  }
}
