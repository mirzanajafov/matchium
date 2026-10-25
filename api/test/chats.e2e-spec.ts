import { clock, http, prisma, useTestApp } from './support/app.js';
import { as, createMatch, man, matchedPair, openChatStream, register, woman } from './support/builders.js';

useTestApp();

describe('chats', () => {
  it('opens only after both people said yes', async () => {
    const { alice, bob, match } = await matchedPair();
    await http().get(`/chats/${match.id}/messages`).set(as(alice.token)).expect(403);
    await http().post(`/matches/${match.id}/decision`).set(as(alice.token)).send({ like: true }).expect(200);
    await http().post(`/chats/${match.id}/messages`).set(as(alice.token)).send({ body: 'hi' }).expect(403);
    expect((await http().get('/chats').set(as(alice.token)).expect(200)).body).toEqual([]);

    await http().post(`/matches/${match.id}/decision`).set(as(bob.token)).send({ like: true }).expect(200);
    const chats = await http().get('/chats').set(as(alice.token)).expect(200);
    expect(chats.body).toEqual([
      expect.objectContaining({
        id: match.id,
        person: expect.objectContaining({ displayName: 'Bob' }),
        lastMessage: null,
      }),
    ]);
  });

  it('delivers messages to both sides and keeps strangers out', async () => {
    const { alice, bob, match } = await matchedPair();
    const stranger = await register();
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }

    const sent = await http()
      .post(`/chats/${match.id}/messages`)
      .set(as(alice.token))
      .send({ body: '  Hey Bob!  ' })
      .expect(201);
    expect(sent.body).toMatchObject({ body: 'Hey Bob!', fromMe: true });
    await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'Hi Alice' }).expect(201);

    const bobView = await http().get(`/chats/${match.id}/messages`).set(as(bob.token)).expect(200);
    expect(bobView.body.person.displayName).toBe('Alice');
    expect(bobView.body.messages.map((m: { body: string; fromMe: boolean }) => [m.body, m.fromMe])).toEqual([
      ['Hey Bob!', false],
      ['Hi Alice', true],
    ]);

    const newer = await http()
      .get(`/chats/${match.id}/messages`)
      .query({ after: bobView.body.messages[1].createdAt })
      .set(as(alice.token))
      .expect(200);
    expect(newer.body.messages.map((m: { body: string }) => m.body)).toEqual(['Hi Alice']);

    const list = await http().get('/chats').set(as(alice.token)).expect(200);
    expect(list.body[0].lastMessage).toMatchObject({ body: 'Hi Alice', fromMe: false });

    await http().get(`/chats/${match.id}/messages`).set(as(stranger.token)).expect(404);
    await http().post(`/chats/${match.id}/messages`).set(as(stranger.token)).send({ body: 'hello' }).expect(404);
    await http().post(`/chats/${match.id}/messages`).set(as(alice.token)).send({ body: '   ' }).expect(400);
    await http()
      .post(`/chats/${match.id}/messages`)
      .set(as(alice.token))
      .send({ body: 'x'.repeat(1001) })
      .expect(400);
    await http().get(`/chats/${match.id}/messages`).query({ after: 'yesterday' }).set(as(alice.token)).expect(400);
  });

  it('opens on the newest page of a long chat, oldest first', async () => {
    const { alice, bob, match } = await matchedPair();
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    await prisma.message.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({
        matchId: match.id,
        senderId: alice.id,
        body: `message ${i}`,
        createdAt: new Date(Date.UTC(2026, 8, 23, 9, 0, i)),
      })),
    });

    const res = await http().get(`/chats/${match.id}/messages`).set(as(bob.token)).expect(200);
    const bodies = res.body.messages.map((m: { body: string }) => m.body);
    expect(bodies).toHaveLength(200);
    expect([bodies[0], bodies.at(-1)]).toEqual(['message 5', 'message 204']);
  });
});

describe('inbox', () => {
  it('counts undecided matches and unread chats', async () => {
    const alice = await woman('Alice');
    const bob = await man('Bob');
    const carl = await man('Carl');
    const inbox = async (token: string) => (await http().get('/inbox').set(as(token)).expect(200)).body;
    const withBob = await createMatch(alice, bob);
    await createMatch(alice, carl);

    expect(await inbox(alice.token)).toMatchObject({ newMatches: 2, unreadChats: 0 });

    await http().post(`/matches/${withBob.id}/decision`).set(as(alice.token)).send({ like: true }).expect(200);
    await http().post(`/matches/${withBob.id}/decision`).set(as(bob.token)).send({ like: true }).expect(200);
    expect(await inbox(alice.token)).toMatchObject({ newMatches: 1, unreadChats: 1 });
    expect(await inbox(bob.token)).toMatchObject({ newMatches: 0, unreadChats: 1 });

    await http().get(`/chats/${withBob.id}/messages`).set(as(alice.token)).expect(200);
    expect(await inbox(alice.token)).toMatchObject({ newMatches: 1, unreadChats: 0 });

    await http().post(`/chats/${withBob.id}/messages`).set(as(bob.token)).send({ body: 'Hi!' }).expect(201);
    expect((await inbox(bob.token)).unreadChats).toBe(0);
    expect((await inbox(alice.token)).unreadChats).toBe(1);
    const list = await http().get('/chats').set(as(alice.token)).expect(200);
    expect(list.body[0]).toMatchObject({ id: withBob.id, unread: true });

    await http().get(`/chats/${withBob.id}/messages`).set(as(alice.token)).expect(200);
    expect((await inbox(alice.token)).unreadChats).toBe(0);

    clock.nextDay();
    expect((await inbox(alice.token)).newMatches).toBe(0);
  });
});

describe('chat stream', () => {
  async function openStream(matchId: string, token: string) {
    const abort = new AbortController();
    const response = await openChatStream(matchId, token, abort.signal);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    async function next(pattern: RegExp) {
      while (!pattern.test(buffer)) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        buffer += decoder.decode(value, { stream: true });
      }
      return buffer;
    }
    return { status: response.status, next, close: () => abort.abort() };
  }

  it('pushes new messages to the other person, skips malformed ones and marks them read', async () => {
    const { alice, bob, match } = await matchedPair();
    const stranger = await register();

    expect((await openStream(match.id, alice.token)).status).toBe(403);
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    expect((await openStream(match.id, stranger.token)).status).toBe(404);

    const stream = await openStream(match.id, alice.token);
    expect(stream.status).toBe(200);
    const broken = { id: 'x', matchId: match.id, senderId: bob.id, body: 'never shown', createdAt: 'soon' };
    await prisma.$executeRaw`SELECT pg_notify('chat_messages', ${JSON.stringify(broken)})`;
    await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'Are you there?' }).expect(201);

    const received = await stream.next(/Are you there\?/);
    expect(received).not.toContain('never shown');
    expect(received).toContain('event: message');
    expect(received).toContain('"fromMe":false');
    stream.close();

    const inbox = await http().get('/inbox').set(as(alice.token)).expect(200);
    expect(inbox.body.unreadChats).toBe(0);
  });

  it('ends a stream whose close was missed while the database listener reconnected', async () => {
    const { alice, bob, match } = await matchedPair();
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    const stream = await openStream(match.id, alice.token);
    await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'Still there?' }).expect(201);
    await stream.next(/Still there\?/);

    await prisma.match.update({ where: { id: match.id }, data: { closedAt: new Date(), notifiedAt: new Date() } });
    const listeners = await prisma.$queryRaw<{ killed: boolean }[]>`
      SELECT pg_terminate_backend(pid) AS killed FROM pg_stat_activity
      WHERE datname = current_database() AND query LIKE 'LISTEN %'`;
    expect(listeners).toEqual([{ killed: true }]);
    await stream.next(/event: closed/);
  });
});
