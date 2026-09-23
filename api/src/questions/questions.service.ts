import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beliefState } from '../common/belief-row.js';
import { Clock, isoDay, utcDay } from '../common/clock.js';
import { BeliefState, DIMENSION_COUNT, certainty, observe, priorBelief } from '../engine/belief.js';
import { pickQuestions } from '../engine/selection.js';
import { DailyQuestionSet } from '../generated/prisma/client.js';
import { isUniqueViolation } from '../prisma/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnswerDto } from './dto/answer.dto.js';

@Injectable()
export class QuestionsService {
  private readonly perDay: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    config: ConfigService,
  ) {
    this.perDay = config.get<number>('QUESTIONS_PER_DAY', 6);
  }

  async today(userId: string) {
    const day = utcDay(this.clock.now());
    const set = await this.ensureSet(userId, day);
    const [questions, answers] = await Promise.all([
      this.prisma.question.findMany({ where: { id: { in: set.questionIds } } }),
      this.prisma.answer.findMany({
        where: { userId, questionId: { in: set.questionIds } },
        select: { questionId: true },
      }),
    ]);
    const answered = new Set(answers.map((a) => a.questionId));
    const byId = new Map(questions.map((q) => [q.id, q]));
    return {
      day: isoDay(day),
      remaining: set.questionIds.length - answered.size,
      questions: set.questionIds.map((id) => ({ id, text: byId.get(id)!.text, answered: answered.has(id) })),
    };
  }

  async answer(userId: string, questionId: string, dto: AnswerDto) {
    const day = utcDay(this.clock.now());
    const set = await this.prisma.dailyQuestionSet.findUnique({ where: { userId_day: { userId, day } } });
    if (!set?.questionIds.includes(questionId)) {
      throw new NotFoundException("This question is not in today's set");
    }
    const question = await this.prisma.question.findUniqueOrThrow({ where: { id: questionId } });

    const next = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<BeliefState[]>`
        SELECT "muSelf", "varSelf", "muPref", "varPref", "logWSum", "logWCount"
        FROM "Belief" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
      const existing = await tx.answer.findUnique({ where: { userId_questionId: { userId, questionId } } });
      if (existing) throw new ConflictException('Question already answered');

      const values = { self: dto.self, partner: dto.partner, importance: dto.importance };
      const state = observe(row ? beliefState(row) : priorBelief(), question, values);
      await tx.answer.create({ data: { userId, questionId, ...values } });
      await tx.belief.upsert({
        where: { userId },
        create: { userId, ...state, answerCount: 1 },
        update: { ...state, answerCount: { increment: 1 } },
      });
      return state;
    });

    const answeredToday = await this.prisma.answer.count({
      where: { userId, questionId: { in: set.questionIds } },
    });
    return {
      remaining: set.questionIds.length - answeredToday,
      certainty: Number(certainty(next).toFixed(3)),
    };
  }

  private async ensureSet(userId: string, day: Date): Promise<DailyQuestionSet> {
    const where = { userId_day: { userId, day } };
    const existing = await this.prisma.dailyQuestionSet.findUnique({ where });
    if (existing) return existing;

    const [belief, bank, answers, populationWeights] = await Promise.all([
      this.prisma.belief.findUnique({ where: { userId } }),
      this.prisma.question.findMany({ orderBy: [{ dimension: 'asc' }, { id: 'asc' }] }),
      this.prisma.answer.findMany({ where: { userId }, select: { questionId: true } }),
      this.populationWeights(),
    ]);
    const questionIds = pickQuestions(
      belief ? beliefState(belief) : priorBelief(),
      bank,
      new Set(answers.map((a) => a.questionId)),
      this.perDay,
      populationWeights,
    );

    try {
      return await this.prisma.dailyQuestionSet.create({ data: { userId, day, questionIds } });
    } catch (error) {
      if (isUniqueViolation(error)) return this.prisma.dailyQuestionSet.findUniqueOrThrow({ where });
      throw error;
    }
  }

  private async populationWeights(): Promise<number[]> {
    const rows = await this.prisma.$queryRaw<{ k: bigint; w: number }[]>`
      SELECT t.k, avg(power(2, t.s / t.c)) AS w
      FROM "Belief" b, unnest(b."logWSum", b."logWCount") WITH ORDINALITY AS t(s, c, k)
      WHERE b."answerCount" > 0
      GROUP BY t.k`;
    const weights = Array<number>(DIMENSION_COUNT).fill(1);
    for (const row of rows) weights[Number(row.k) - 1] = row.w;
    return weights;
  }
}
