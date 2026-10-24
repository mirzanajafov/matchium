import { clock, http, prisma, useTestApp } from './support/app.js';
import { as, createMatch, man, openChatStream, registerAdmin, woman } from './support/builders.js';

useTestApp();

describe('moderation', () => {
  async function reported() {
    const admin = await registerAdmin();
    const alice = await woman('Alice');
    const mallory = await man('Mallory');
    const carol = await woman('Carol');
    const match = await createMatch(alice, mallory);
    const other = await createMatch(carol, mallory, { score: 0.5 });
    for (const who of [alice, mallory]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    await http().post(`/chats/${match.id}/messages`).set(as(mallory.token)).send({ body: 'send me money' }).expect(201);
    await http()
      .post(`/matches/${match.id}/unmatch`)
      .set(as(alice.token))
      .send({ report: { reason: 'SPAM', note: 'asked for money' } })
      .expect(200);
    return { admin, alice, mallory, carol, match, other };
  }

  it('keeps the queue away from regular users', async () => {
    const { alice } = await reported();
    await http().get('/admin/reports').set(as(alice.token)).expect(403);
    await http().get('/admin/reports').expect(401);
    expect((await http().get('/me').set(as(alice.token)).expect(200)).body.role).toBe('USER');
  });

  it('shows open reports with the conversation as evidence', async () => {
    const { admin, alice, mallory } = await reported();
    const res = await http().get('/admin/reports').set(as(admin.token)).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      reason: 'SPAM',
      note: 'asked for money',
      reporter: { id: alice.id, displayName: 'Alice' },
      reported: { id: mallory.id, displayName: 'Mallory', reportsAgainst: 1, banned: false },
      messages: [{ from: 'reported', body: 'send me money' }],
    });
    expect((await http().get('/admin/reports?status=reviewed').set(as(admin.token)).expect(200)).body).toEqual([]);
    await http().get('/admin/reports?status=everything').set(as(admin.token)).expect(400);
  });

  it('bans: locks the account out, closes their matches and resolves the report once', async () => {
    const { admin, mallory, carol, other } = await reported();
    const [report] = (await http().get('/admin/reports').set(as(admin.token)).expect(200)).body;

    const res = await http()
      .post(`/admin/reports/${report.id}/resolve`)
      .set(as(admin.token))
      .send({ outcome: 'BANNED' })
      .expect(200);
    expect(res.body).toEqual({ outcome: 'BANNED', closedMatches: 1 });
    await http()
      .post(`/admin/reports/${report.id}/resolve`)
      .set(as(admin.token))
      .send({ outcome: 'DISMISSED' })
      .expect(409);

    await http().get('/me').set(as(mallory.token)).expect(401);
    const login = await http()
      .post('/auth/login')
      .send({ email: mallory.email, password: 'correct horse battery' })
      .expect(403);
    expect(login.body.message).toMatch(/suspended/);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: other.id } })).closedAt).not.toBeNull();
    expect((await http().get('/matches/today').set(as(carol.token)).expect(200)).body.matches).toEqual([]);

    const reviewed = await http().get('/admin/reports?status=reviewed').set(as(admin.token)).expect(200);
    expect(reviewed.body[0]).toMatchObject({ outcome: 'BANNED', reported: { banned: true } });
  });

  it('stamps the unmatch, the ban and the ended sessions with the app clock', async () => {
    const { admin, mallory, match, other } = await reported();
    const [report] = (await http().get('/admin/reports').set(as(admin.token)).expect(200)).body;
    await http()
      .post(`/admin/reports/${report.id}/resolve`)
      .set(as(admin.token))
      .send({ outcome: 'BANNED' })
      .expect(200);

    const now = clock.now();
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).closedAt).toEqual(now);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: other.id } })).closedAt).toEqual(now);
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).reviewedAt).toEqual(now);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: mallory.id } })).bannedAt).toEqual(now);
    const sessions = await prisma.session.findMany({ where: { userId: mallory.id }, select: { revokedAt: true } });
    expect(sessions).toEqual([{ revokedAt: now }]);
  });

  it('ends every open chat of a banned person', async () => {
    const { admin, mallory, carol, other } = await reported();
    const dora = await woman('Dora');
    const third = await createMatch(dora, mallory, { score: 0.5 });
    for (const [matchId, who] of [
      [other.id, carol],
      [other.id, mallory],
      [third.id, dora],
      [third.id, mallory],
    ] as const) {
      await http().post(`/matches/${matchId}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    const streams = await Promise.all([openChatStream(other.id, carol.token), openChatStream(third.id, dora.token)]);

    const [report] = (await http().get('/admin/reports').set(as(admin.token)).expect(200)).body;
    await http()
      .post(`/admin/reports/${report.id}/resolve`)
      .set(as(admin.token))
      .send({ outcome: 'BANNED' })
      .expect(200);
    for (const stream of streams) expect(await stream.text()).toContain('event: closed');
  });

  it('dismisses without touching the account', async () => {
    const { admin, mallory } = await reported();
    const [report] = (await http().get('/admin/reports').set(as(admin.token)).expect(200)).body;
    await http()
      .post(`/admin/reports/${report.id}/resolve`)
      .set(as(admin.token))
      .send({ outcome: 'DISMISSED' })
      .expect(200);
    await http().get('/me').set(as(mallory.token)).expect(200);
    await http().post(`/admin/reports/${report.id}/resolve`).set(as(admin.token)).send({ outcome: 'NOPE' }).expect(400);
  });
});
