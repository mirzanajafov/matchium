import { clock, http, prisma, useTestApp } from './support/app.js';
import { as, register } from './support/builders.js';

useTestApp();

describe('daily questions', () => {
  it('returns a stable set for the day and updates beliefs on answer', async () => {
    const { token } = await register();
    const auth = as(token);

    const first = await http().get('/questions/today').set(auth).expect(200);
    expect(first.body.questions).toHaveLength(6);
    expect(first.body.remaining).toBe(6);
    const again = await http().get('/questions/today').set(auth).expect(200);
    expect(again.body.questions.map((q: { id: string }) => q.id)).toEqual(
      first.body.questions.map((q: { id: string }) => q.id),
    );

    const questionId = first.body.questions[0].id;
    const answer = await http()
      .post(`/questions/${questionId}/answer`)
      .set(auth)
      .send({ self: 5, partner: 4, importance: 5 })
      .expect(201);
    expect(answer.body.remaining).toBe(5);
    expect(answer.body.certainty).toBeGreaterThan(0);

    await http()
      .post(`/questions/${questionId}/answer`)
      .set(auth)
      .send({ self: 1, partner: 1, importance: 1 })
      .expect(409);
    await http()
      .post(`/questions/${questionId}/answer`)
      .set(auth)
      .send({ self: 9, partner: 1, importance: 1 })
      .expect(400);

    const outside = await prisma.question.findFirstOrThrow({
      where: { id: { notIn: first.body.questions.map((q: { id: string }) => q.id) } },
    });
    await http()
      .post(`/questions/${outside.id}/answer`)
      .set(auth)
      .send({ self: 3, partner: 3, importance: 3 })
      .expect(404);
    await http()
      .post('/questions/DROP%20TABLE/answer')
      .set(auth)
      .send({ self: 3, partner: 3, importance: 3 })
      .expect(400);

    const me = await http().get('/me').set(auth).expect(200);
    expect(me.body.answerCount).toBe(1);
    expect(me.body.certainty).toBe(answer.body.certainty);
  });

  it('serializes concurrent answers without losing belief updates', async () => {
    const { token, id } = await register();
    const auth = as(token);
    const { body } = await http().get('/questions/today').set(auth).expect(200);

    await Promise.all(
      body.questions.map((q: { id: string }) =>
        http().post(`/questions/${q.id}/answer`).set(auth).send({ self: 4, partner: 2, importance: 4 }).expect(201),
      ),
    );

    const belief = await prisma.belief.findUniqueOrThrow({ where: { userId: id } });
    expect(belief.answerCount).toBe(6);
    expect(belief.logWCount.reduce((a, b) => a + b, 0)).toBe(8 + 6);
  });

  it('gives a fresh set the next day without repeating answered questions', async () => {
    const { token } = await register();
    const auth = as(token);
    const today = await http().get('/questions/today').set(auth).expect(200);
    for (const q of today.body.questions) {
      await http().post(`/questions/${q.id}/answer`).set(auth).send({ self: 2, partner: 3, importance: 3 }).expect(201);
    }

    clock.nextDay();
    const tomorrow = await http().get('/questions/today').set(auth).expect(200);
    expect(tomorrow.body.day).toBe('2026-09-24');
    const seen = new Set(today.body.questions.map((q: { id: string }) => q.id));
    expect(tomorrow.body.questions.some((q: { id: string }) => seen.has(q.id))).toBe(false);
  });
});
