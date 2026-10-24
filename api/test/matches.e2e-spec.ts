import { clock, http, prisma, useTestApp } from './support/app.js';
import { as, createMatch, man, matchedPair, openChatStream, register, woman } from './support/builders.js';

useTestApp();

describe('matches', () => {
  it('shows today’s match to both people and reports mutual likes', async () => {
    const alice = await woman('Alice');
    const bob = await man('Bob');
    const eve = await register();
    const match = await createMatch(alice, bob, {
      score: 0.81,
      confidence: 0.64,
      aligned: ['family', 'planning'],
      friction: 'adventure',
    });

    const aliceView = await http().get('/matches/today').set(as(alice.token)).expect(200);
    expect(aliceView.body.matches).toHaveLength(1);
    expect(aliceView.body.matches[0]).toMatchObject({
      id: match.id,
      person: { id: bob.id, displayName: 'Bob', city: 'Baku' },
      aligned: ['family', 'planning'],
      decision: null,
      mutual: false,
    });
    expect(aliceView.body.matches[0].person.email).toBeUndefined();

    const first = await http()
      .post(`/matches/${match.id}/decision`)
      .set(as(alice.token))
      .send({ like: true })
      .expect(200);
    expect(first.body.mutual).toBe(false);

    const second = await http()
      .post(`/matches/${match.id}/decision`)
      .set(as(bob.token))
      .send({ like: true })
      .expect(200);
    expect(second.body.mutual).toBe(true);

    await http().post(`/matches/${match.id}/decision`).set(as(alice.token)).send({ like: false }).expect(409);
    await http().post(`/matches/${match.id}/decision`).set(as(eve.token)).send({ like: true }).expect(404);

    const bobView = await http().get('/matches/today').set(as(bob.token)).expect(200);
    expect(bobView.body.matches[0]).toMatchObject({ decision: 'LIKE', mutual: true, person: { id: alice.id } });

    const before = await http().get('/me').set(as(bob.token)).expect(200);
    expect(before.body).toMatchObject({ decisionsLearned: 0, preferenceShifts: [] });
    await prisma.matchDecision.updateMany({ where: { userId: bob.id }, data: { learnedAt: new Date() } });
    await prisma.belief.update({
      where: { userId: bob.id },
      data: { muGap: [0, 0.5, 0, 0, 0, 0, 0, 0], varGap: Array(8).fill(0.2) },
    });
    const after = await http().get('/me').set(as(bob.token)).expect(200);
    expect(after.body).toMatchObject({
      decisionsLearned: 1,
      preferenceShifts: [{ dimension: 'adventure', direction: 'more' }],
    });

    clock.nextDay();
    const tomorrow = await http().get('/matches/today').set(as(alice.token)).expect(200);
    expect(tomorrow.body.matches).toHaveLength(0);
  });
});

describe('unmatch and report', () => {
  async function chatting() {
    const { alice, bob, match } = await matchedPair();
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'hey' }).expect(201);
    return { alice, bob, match };
  }

  it('closes the chat for both people and keeps it closed', async () => {
    const { alice, bob, match } = await chatting();
    const stranger = await register();
    await http().post(`/matches/${match.id}/unmatch`).set(as(stranger.token)).send({}).expect(404);

    const res = await http().post(`/matches/${match.id}/unmatch`).set(as(alice.token)).send({}).expect(200);
    expect(res.body).toEqual({ closed: true, reported: false });

    for (const who of [alice, bob]) {
      expect((await http().get('/chats').set(as(who.token)).expect(200)).body).toEqual([]);
      expect((await http().get('/matches/today').set(as(who.token)).expect(200)).body.matches).toEqual([]);
      expect((await http().get('/inbox').set(as(who.token)).expect(200)).body).toMatchObject({
        newMatches: 0,
        unreadChats: 0,
      });
      await http().get(`/chats/${match.id}/messages`).set(as(who.token)).expect(404);
    }
    await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'hello?' }).expect(404);
    await http().post(`/matches/${match.id}/decision`).set(as(bob.token)).send({ like: true }).expect(404);
    await http().post(`/matches/${match.id}/unmatch`).set(as(bob.token)).send({}).expect(200);

    const stored = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(stored.closedById).toBe(alice.id);
  });

  it('stores no message after the chat closed, even when the two cross', { repeats: 4 }, async () => {
    const { alice, bob, match } = await chatting();
    const messages = () => prisma.message.count({ where: { matchId: match.id } });
    const send = async (n: number) =>
      (
        await http()
          .post(`/chats/${match.id}/messages`)
          .set(as(bob.token))
          .send({ body: `still there? ${n}` })
      ).status;

    const before = [1, 2, 3, 4, 5].map(send);
    const storedAtClose = http()
      .post(`/matches/${match.id}/unmatch`)
      .set(as(alice.token))
      .send({})
      .expect(200)
      .then(messages);
    const after = [6, 7, 8, 9, 10].map(send);

    const statuses = await Promise.all([...before, ...after]);
    expect(statuses.every((status) => status === 201 || status === 404)).toBe(true);
    expect(await messages()).toBe(await storedAtClose);
  });

  it('files a report against the other person', async () => {
    const { alice, bob, match } = await chatting();
    await http()
      .post(`/matches/${match.id}/unmatch`)
      .set(as(alice.token))
      .send({ report: { reason: 'NOT_A_REASON' } })
      .expect(400);
    await http()
      .post(`/matches/${match.id}/unmatch`)
      .set(as(alice.token))
      .send({ report: { reason: 'HARASSMENT', note: 'x'.repeat(501) } })
      .expect(400);

    const res = await http()
      .post(`/matches/${match.id}/unmatch`)
      .set(as(alice.token))
      .send({ report: { reason: 'HARASSMENT', note: '  kept insulting me  ' } })
      .expect(200);
    expect(res.body).toEqual({ closed: true, reported: true });
    await http()
      .post(`/matches/${match.id}/unmatch`)
      .set(as(alice.token))
      .send({ report: { reason: 'SPAM' } })
      .expect(200);

    const reports = await prisma.report.findMany();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reporterId: alice.id, reportedId: bob.id, reason: 'SPAM', note: null });
  });

  it('ends an open chat stream when the match is closed', async () => {
    const { alice, bob, match } = await chatting();
    const response = await openChatStream(match.id, alice.token);
    expect(response.status).toBe(200);

    await http().post(`/matches/${match.id}/unmatch`).set(as(bob.token)).send({}).expect(200);
    const body = await response.text();
    expect(body).toContain('event: closed');
  });
});
