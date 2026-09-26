import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Clock } from '../src/common/clock.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

class FixedClock extends Clock {
  current = new Date('2026-09-23T09:00:00Z');

  now() {
    return new Date(this.current);
  }

  nextDay() {
    this.current = new Date(this.current.getTime() + 24 * 60 * 60 * 1000);
  }
}

let app: INestApplication;
let prisma: PrismaService;
let clock: FixedClock;
let counter = 0;

function http() {
  return request(app.getHttpServer());
}

async function register(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const body = {
    email: `user${counter}@example.com`,
    password: 'correct horse battery',
    displayName: `User ${counter}`,
    birthDate: '1995-04-12',
    gender: 'WOMAN',
    seeking: ['MAN'],
    city: 'Baku',
    ...overrides,
  };
  const res = await http().post('/auth/register').send(body).expect(201);
  const me = await http().get('/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
  return { token: res.body.accessToken as string, id: me.body.id as string, email: body.email };
}

beforeAll(async () => {
  clock = new FixedClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "User" CASCADE');
  clock.current = new Date('2026-09-23T09:00:00Z');
});

afterAll(async () => {
  await app.close();
});

describe('auth', () => {
  it('registers, logs in and rejects bad credentials', async () => {
    const user = await register();
    await http().post('/auth/login').send({ email: user.email, password: 'correct horse battery' }).expect(200);
    await http().post('/auth/login').send({ email: user.email, password: 'wrong password' }).expect(401);
    await http().post('/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' }).expect(401);
  });

  it('rejects duplicates, minors and malformed input', async () => {
    const user = await register();
    await http()
      .post('/auth/register')
      .send({ email: user.email.toUpperCase(), password: 'another password', displayName: 'X', birthDate: '1990-01-01', gender: 'MAN', seeking: ['WOMAN'], city: 'Baku' })
      .expect(409);
    await http()
      .post('/auth/register')
      .send({ email: 'kid@example.com', password: 'long enough', displayName: 'Kid', birthDate: '2010-01-01', gender: 'MAN', seeking: ['WOMAN'], city: 'Baku' })
      .expect(400);
    await http()
      .post('/auth/register')
      .send({ email: 'x@example.com', password: 'long enough', displayName: 'X', birthDate: '1990-01-01', gender: 'ROBOT', seeking: [], city: 'Baku', admin: true })
      .expect(400);
  });

  it('protects private routes', async () => {
    await http().get('/me').expect(401);
    await http().get('/me').set('Authorization', 'Bearer not-a-token').expect(401);
    await http().get('/health').expect(200);
  });
});

describe('daily questions', () => {
  it('returns a stable set for the day and updates beliefs on answer', async () => {
    const { token } = await register();
    const auth = { Authorization: `Bearer ${token}` };

    const first = await http().get('/questions/today').set(auth).expect(200);
    expect(first.body.questions).toHaveLength(6);
    expect(first.body.remaining).toBe(6);
    const again = await http().get('/questions/today').set(auth).expect(200);
    expect(again.body.questions.map((q: { id: string }) => q.id)).toEqual(first.body.questions.map((q: { id: string }) => q.id));

    const questionId = first.body.questions[0].id;
    const answer = await http()
      .post(`/questions/${questionId}/answer`)
      .set(auth)
      .send({ self: 5, partner: 4, importance: 5 })
      .expect(201);
    expect(answer.body.remaining).toBe(5);
    expect(answer.body.certainty).toBeGreaterThan(0);

    await http().post(`/questions/${questionId}/answer`).set(auth).send({ self: 1, partner: 1, importance: 1 }).expect(409);
    await http().post(`/questions/${questionId}/answer`).set(auth).send({ self: 9, partner: 1, importance: 1 }).expect(400);

    const outside = await prisma.question.findFirstOrThrow({
      where: { id: { notIn: first.body.questions.map((q: { id: string }) => q.id) } },
    });
    await http().post(`/questions/${outside.id}/answer`).set(auth).send({ self: 3, partner: 3, importance: 3 }).expect(404);

    const me = await http().get('/me').set(auth).expect(200);
    expect(me.body.answerCount).toBe(1);
    expect(me.body.certainty).toBe(answer.body.certainty);
  });

  it('serializes concurrent answers without losing belief updates', async () => {
    const { token, id } = await register();
    const auth = { Authorization: `Bearer ${token}` };
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
    const auth = { Authorization: `Bearer ${token}` };
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

describe('matches', () => {
  it('shows today’s match to both people and reports mutual likes', async () => {
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'] });
    const bob = await register({ gender: 'MAN', seeking: ['WOMAN'], displayName: 'Bob' });
    const eve = await register();
    const match = await prisma.match.create({
      data: {
        day: new Date('2026-09-23'),
        userAId: alice.id,
        userBId: bob.id,
        score: 0.81,
        confidence: 0.64,
        aligned: ['family', 'planning'],
        friction: 'adventure',
      },
    });

    const aliceView = await http().get('/matches/today').set('Authorization', `Bearer ${alice.token}`).expect(200);
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
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ like: true })
      .expect(200);
    expect(first.body.mutual).toBe(false);

    const second = await http()
      .post(`/matches/${match.id}/decision`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ like: true })
      .expect(200);
    expect(second.body.mutual).toBe(true);

    await http().post(`/matches/${match.id}/decision`).set('Authorization', `Bearer ${alice.token}`).send({ like: false }).expect(409);
    await http().post(`/matches/${match.id}/decision`).set('Authorization', `Bearer ${eve.token}`).send({ like: true }).expect(404);

    const bobView = await http().get('/matches/today').set('Authorization', `Bearer ${bob.token}`).expect(200);
    expect(bobView.body.matches[0]).toMatchObject({ decision: 'LIKE', mutual: true, person: { id: alice.id } });

    const before = await http().get('/me').set('Authorization', `Bearer ${bob.token}`).expect(200);
    expect(before.body).toMatchObject({ decisionsLearned: 0, preferenceShifts: [] });
    await prisma.matchDecision.updateMany({ where: { userId: bob.id }, data: { learnedAt: new Date() } });
    await prisma.belief.update({ where: { userId: bob.id }, data: { muGap: [0, 0.5, 0, 0, 0, 0, 0, 0], varGap: Array(8).fill(0.2) } });
    const after = await http().get('/me').set('Authorization', `Bearer ${bob.token}`).expect(200);
    expect(after.body).toMatchObject({ decisionsLearned: 1, preferenceShifts: [{ dimension: 'adventure', direction: 'more' }] });

    clock.nextDay();
    const tomorrow = await http().get('/matches/today').set('Authorization', `Bearer ${alice.token}`).expect(200);
    expect(tomorrow.body.matches).toHaveLength(0);
  });
});

describe('chats', () => {
  async function pair() {
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Alice' });
    const bob = await register({ gender: 'MAN', seeking: ['WOMAN'], displayName: 'Bob' });
    const match = await prisma.match.create({
      data: {
        day: new Date('2026-09-23'),
        userAId: alice.id,
        userBId: bob.id,
        score: 0.7,
        confidence: 0.5,
        aligned: ['family'],
        friction: 'adventure',
      },
    });
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    return { alice, bob, match, as };
  }

  it('opens only after both people said yes', async () => {
    const { alice, bob, match, as } = await pair();
    await http().get(`/chats/${match.id}/messages`).set(as(alice.token)).expect(403);
    await http().post(`/matches/${match.id}/decision`).set(as(alice.token)).send({ like: true }).expect(200);
    await http().post(`/chats/${match.id}/messages`).set(as(alice.token)).send({ body: 'hi' }).expect(403);
    expect((await http().get('/chats').set(as(alice.token)).expect(200)).body).toEqual([]);

    await http().post(`/matches/${match.id}/decision`).set(as(bob.token)).send({ like: true }).expect(200);
    const chats = await http().get('/chats').set(as(alice.token)).expect(200);
    expect(chats.body).toEqual([
      expect.objectContaining({ id: match.id, person: expect.objectContaining({ displayName: 'Bob' }), lastMessage: null }),
    ]);
  });

  it('delivers messages to both sides and keeps strangers out', async () => {
    const { alice, bob, match, as } = await pair();
    const stranger = await register();
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }

    const sent = await http().post(`/chats/${match.id}/messages`).set(as(alice.token)).send({ body: '  Hey Bob!  ' }).expect(201);
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
    await http().post(`/chats/${match.id}/messages`).set(as(alice.token)).send({ body: 'x'.repeat(1001) }).expect(400);
    await http().get(`/chats/${match.id}/messages`).query({ after: 'yesterday' }).set(as(alice.token)).expect(400);
  });
});

describe('inbox', () => {
  it('counts undecided matches and unread chats', async () => {
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'] });
    const bob = await register({ gender: 'MAN', seeking: ['WOMAN'] });
    const carl = await register({ gender: 'MAN', seeking: ['WOMAN'] });
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const inbox = async (token: string) => (await http().get('/inbox').set(as(token)).expect(200)).body;
    const create = (other: string) =>
      prisma.match.create({
        data: { day: new Date('2026-09-23'), userAId: alice.id, userBId: other, score: 0.6, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
      });
    const withBob = await create(bob.id);
    await create(carl.id);

    expect(await inbox(alice.token)).toEqual({ newMatches: 2, unreadChats: 0 });

    await http().post(`/matches/${withBob.id}/decision`).set(as(alice.token)).send({ like: true }).expect(200);
    await http().post(`/matches/${withBob.id}/decision`).set(as(bob.token)).send({ like: true }).expect(200);
    expect(await inbox(alice.token)).toEqual({ newMatches: 1, unreadChats: 1 });
    expect(await inbox(bob.token)).toEqual({ newMatches: 0, unreadChats: 1 });

    await http().get(`/chats/${withBob.id}/messages`).set(as(alice.token)).expect(200);
    expect(await inbox(alice.token)).toEqual({ newMatches: 1, unreadChats: 0 });

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
    const server = app.getHttpServer() as import('node:http').Server;
    if (!server.listening) await app.listen(0);
    const { port } = server.address() as import('node:net').AddressInfo;
    const abort = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}/chats/${matchId}/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abort.signal,
    });
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

  it('pushes new messages to the other person and marks them read', async () => {
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'] });
    const bob = await register({ gender: 'MAN', seeking: ['WOMAN'] });
    const stranger = await register();
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const match = await prisma.match.create({
      data: { day: new Date('2026-09-23'), userAId: alice.id, userBId: bob.id, score: 0.6, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
    });

    expect((await openStream(match.id, alice.token)).status).toBe(403);
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    expect((await openStream(match.id, stranger.token)).status).toBe(404);

    const stream = await openStream(match.id, alice.token);
    expect(stream.status).toBe(200);
    await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'Are you there?' }).expect(201);

    const received = await stream.next(/Are you there\?/);
    expect(received).toContain('event: message');
    expect(received).toContain('"fromMe":false');
    stream.close();

    const inbox = await http().get('/inbox').set(as(alice.token)).expect(200);
    expect(inbox.body.unreadChats).toBe(0);
  });
});
