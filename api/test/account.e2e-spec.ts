import { http, mails, prisma, useTestApp } from './support/app.js';
import { as, createMatch, man, matchedPair, registerAdmin, signup, woman } from './support/builders.js';

useTestApp();

describe('account data', () => {
  async function active() {
    const { alice, bob, match } = await matchedPair();
    const today = await http().get('/questions/today').set(as(alice.token)).expect(200);
    const first = today.body.questions[0];
    await http()
      .post(`/questions/${first.id}/answer`)
      .set(as(alice.token))
      .send({ self: 4, partner: 2, importance: 5 })
      .expect(201);
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    await http().post(`/chats/${match.id}/messages`).set(as(alice.token)).send({ body: 'hi Bob' }).expect(201);
    await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'hi Alice' }).expect(201);
    return { alice, bob, match, question: first };
  }

  it('exports what we hold about you and nothing about the other person', async () => {
    const { alice, question } = await active();
    const res = await http().get('/me/export').set(as(alice.token)).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.profile).toMatchObject({ email: alice.email, displayName: 'Alice', city: 'Baku' });
    expect(res.body.answers).toEqual([
      expect.objectContaining({ question: question.text, you: 4, partner: 2, importance: 5 }),
    ]);
    expect(Object.keys(res.body.model)).toHaveLength(8);
    expect(res.body.matches).toEqual([
      expect.objectContaining({ day: '2026-09-23', with: 'Bob', yourDecision: 'LIKE', mutual: true, closed: false }),
    ]);
    expect(res.body.messagesSent.map((m: { body: string }) => m.body)).toEqual(['hi Bob']);
    expect(JSON.stringify(res.body)).not.toContain('hi Alice');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('deletes the account only with the right password and cuts off the old token', async () => {
    const { alice, bob, match } = await active();
    await http().delete('/me').set(as(alice.token)).send({}).expect(400);
    await http().delete('/me').set(as(alice.token)).send({ password: 'not it' }).expect(403);
    await http().get('/me').set(as(alice.token)).expect(200);

    await http().delete('/me').set(as(alice.token)).send({ password: 'correct horse battery' }).expect(204);

    await http().get('/me').set(as(alice.token)).expect(401);
    await http().post('/auth/login').send({ email: alice.email, password: 'correct horse battery' }).expect(401);
    expect(await prisma.match.findUnique({ where: { id: match.id } })).toBeNull();
    expect(await prisma.answer.count({ where: { userId: alice.id } })).toBe(0);
    expect((await http().get('/chats').set(as(bob.token)).expect(200)).body).toEqual([]);
  });
});

describe('safety after deletion', () => {
  it('keeps a report and its evidence when the reported person deletes their account, and keeps them out', async () => {
    const admin = await registerAdmin();
    const alice = await woman('Alice');
    const mallory = await man('Mallory');
    const match = await createMatch(alice, mallory);
    for (const who of [alice, mallory]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    await http()
      .post(`/chats/${match.id}/messages`)
      .set(as(mallory.token))
      .send({ body: 'wire me 500 AZN' })
      .expect(201);
    await http()
      .post(`/matches/${match.id}/unmatch`)
      .set(as(alice.token))
      .send({ report: { reason: 'SPAM' } })
      .expect(200);

    await http().delete('/me').set(as(mallory.token)).send({ password: 'correct horse battery' }).expect(204);

    const [report] = (await http().get('/admin/reports').set(as(admin.token)).expect(200)).body;
    expect(report).toMatchObject({
      matchedOn: null,
      reported: { id: null, deleted: true, displayName: 'Mallory', email: mallory.email, reportsAgainst: 1 },
      messages: [{ from: 'reported', body: 'wire me 500 AZN' }],
    });

    await http()
      .post(`/admin/reports/${report.id}/resolve`)
      .set(as(admin.token))
      .send({ outcome: 'BANNED' })
      .expect(200);
    mails.sent = [];
    const again = signup({ email: mallory.email.toUpperCase(), password: 'another password' });
    await http().post('/auth/register').send(again).expect(201, { checkEmail: true });
    expect(mails.sent).toEqual([]);
    expect(await prisma.pendingSignup.count()).toBe(0);

    mails.enabled = false;
    const refused = await http().post('/auth/register').send(again).expect(403);
    expect(refused.body.message).toMatch(/can't be used/);
  });
});
