import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Clock } from '../src/common/clock.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SessionSweeper } from '../src/auth/session-sweeper.js';
import { RateLimiter } from '../src/limits/rate-limiter.js';
import { type Mail, Mailer } from '../src/mail/mailer.js';
import { PhotoStore } from '../src/photos/photo-store.js';
import sharp from 'sharp';
import { MatchNotifier } from '../src/push/match-notifier.js';
import { type Delivery, type PushMessage, PushSender, type PushTarget } from '../src/push/push-sender.js';

class FakePushSender extends PushSender {
  readonly publicKey = 'test-public-key';
  sent: { endpoint: string; message: PushMessage }[] = [];
  gone = new Set<string>();

  send(target: PushTarget, message: PushMessage): Promise<Delivery> {
    if (this.gone.has(target.endpoint)) return Promise.resolve('gone');
    this.sent.push({ endpoint: target.endpoint, message });
    return Promise.resolve('sent');
  }
}

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
let pushes: FakePushSender;
let mails: FakeMailer;
let photos: FakePhotoStore;

class FakePhotoStore extends PhotoStore {
  readonly enabled = true;
  objects = new Map<string, Buffer>();

  put(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, body);
    return Promise.resolve();
  }

  get(key: string): Promise<Buffer> {
    const body = this.objects.get(key);
    return body ? Promise.resolve(body) : Promise.reject(new Error('missing'));
  }

  delete(keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
    return Promise.resolve();
  }
}

class FakeMailer extends Mailer {
  readonly enabled = true;
  sent: Mail[] = [];

  send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    return Promise.resolve();
  }
}
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
  pushes = new FakePushSender();
  mails = new FakeMailer();
  photos = new FakePhotoStore();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(PushSender)
    .useValue(pushes)
    .overrideProvider(Mailer)
    .useValue(mails)
    .overrideProvider(PhotoStore)
    .useValue(photos)
    .compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "User", "RateLimit" CASCADE');
  clock.current = new Date('2026-09-23T09:00:00Z');
  pushes.sent = [];
  mails.sent = [];
  photos.objects.clear();
  pushes.gone.clear();
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

describe('push notifications', () => {
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const subscription = (n: number) => ({
    endpoint: `https://push.example.com/send/${n}`,
    keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` },
  });
  const sentTo = (endpoint: string) => pushes.sent.filter((p) => p.endpoint === endpoint).map((p) => p.message);

  async function mutualPair() {
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Alice' });
    const bob = await register({ gender: 'MAN', seeking: ['WOMAN'], displayName: 'Bob' });
    const match = await prisma.match.create({
      data: { day: new Date('2026-09-23'), userAId: alice.id, userBId: bob.id, score: 0.6, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
    });
    return { alice, bob, match };
  }

  it('hands out the public key and validates subscriptions', async () => {
    expect((await http().get('/push/key').expect(200)).body).toEqual({ publicKey: 'test-public-key' });
    const alice = await register();
    await http().post('/push/subscriptions').send(subscription(1)).expect(401);
    await http()
      .post('/push/subscriptions')
      .set(as(alice.token))
      .send({ ...subscription(1), endpoint: 'http://push.example.com/insecure' })
      .expect(400);
    await http().post('/push/subscriptions').set(as(alice.token)).send({ endpoint: subscription(1).endpoint, keys: {} }).expect(400);
    await http().post('/push/subscriptions').set(as(alice.token)).send(subscription(1)).expect(204);
    await http().post('/push/subscriptions').set(as(alice.token)).send(subscription(1)).expect(204);
    expect(await prisma.pushSubscription.count({ where: { userId: alice.id } })).toBe(1);
  });

  it('moves a browser to whoever subscribed last and only lets owners unsubscribe', async () => {
    const alice = await register();
    const bob = await register();
    await http().post('/push/subscriptions').set(as(alice.token)).send(subscription(2)).expect(204);
    await http().post('/push/subscriptions').set(as(bob.token)).send(subscription(2)).expect(204);
    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: subscription(2).endpoint } });
    expect(row.userId).toBe(bob.id);

    await http().delete('/push/subscriptions').set(as(alice.token)).send({ endpoint: subscription(2).endpoint }).expect(204);
    expect(await prisma.pushSubscription.count()).toBe(1);
    await http().delete('/push/subscriptions').set(as(bob.token)).send({ endpoint: subscription(2).endpoint }).expect(204);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('tells the other person about a mutual like and new messages, and drops dead endpoints', async () => {
    const { alice, bob, match } = await mutualPair();
    await http().post('/push/subscriptions').set(as(alice.token)).send(subscription(3)).expect(204);
    await http().post('/push/subscriptions').set(as(bob.token)).send(subscription(4)).expect(204);

    await http().post(`/matches/${match.id}/decision`).set(as(alice.token)).send({ like: true }).expect(200);
    await http().post(`/matches/${match.id}/decision`).set(as(bob.token)).send({ like: true }).expect(200);
    await vi.waitFor(() => expect(sentTo(subscription(3).endpoint)).toHaveLength(1));
    expect(sentTo(subscription(3).endpoint)[0]).toMatchObject({ title: "It's mutual", url: `/chats/${match.id}` });
    expect(sentTo(subscription(4).endpoint)).toHaveLength(0);

    await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'Coffee on Saturday?' }).expect(201);
    await vi.waitFor(() => expect(sentTo(subscription(3).endpoint)).toHaveLength(2));
    expect(sentTo(subscription(3).endpoint)[1]).toEqual({
      title: 'Bob',
      body: 'Coffee on Saturday?',
      url: `/chats/${match.id}`,
      tag: `chat-${match.id}`,
    });

    pushes.gone.add(subscription(3).endpoint);
    await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'x'.repeat(300) }).expect(201);
    await vi.waitFor(async () => expect(await prisma.pushSubscription.count({ where: { userId: alice.id } })).toBe(0));
  });

  it('announces the nightly matches once, even if the signal arrives twice', async () => {
    const { alice, bob } = await mutualPair();
    await http().post('/push/subscriptions').set(as(alice.token)).send(subscription(5)).expect(204);
    await http().post('/push/subscriptions').set(as(bob.token)).send(subscription(6)).expect(204);

    await prisma.$executeRaw`SELECT pg_notify('matches_ready', '{"day":"2026-09-23"}')`;
    await vi.waitFor(() => expect(pushes.sent).toHaveLength(2));
    expect(sentTo(subscription(5).endpoint)[0]).toMatchObject({ body: 'You have a new match today.', url: '/today' });

    expect(await app.get(MatchNotifier).deliver('2026-09-23')).toBe(0);
    expect(await app.get(MatchNotifier).deliver('not a day')).toBe(0);
    expect(pushes.sent).toHaveLength(2);
  });
});

describe('unmatch and report', () => {
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function chatting() {
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Alice' });
    const bob = await register({ gender: 'MAN', seeking: ['WOMAN'], displayName: 'Bob' });
    const match = await prisma.match.create({
      data: { day: new Date('2026-09-23'), userAId: alice.id, userBId: bob.id, score: 0.6, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
    });
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
      expect((await http().get('/inbox').set(as(who.token)).expect(200)).body).toMatchObject({ newMatches: 0, unreadChats: 0 });
      await http().get(`/chats/${match.id}/messages`).set(as(who.token)).expect(404);
    }
    await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'hello?' }).expect(404);
    await http().post(`/matches/${match.id}/unmatch`).set(as(bob.token)).send({}).expect(200);

    const stored = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(stored.closedById).toBe(alice.id);
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
    await http().post(`/matches/${match.id}/unmatch`).set(as(alice.token)).send({ report: { reason: 'SPAM' } }).expect(200);

    const reports = await prisma.report.findMany();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reporterId: alice.id, reportedId: bob.id, reason: 'SPAM', note: null });
  });

  it('ends an open chat stream when the match is closed', async () => {
    const { alice, bob, match } = await chatting();
    const server = app.getHttpServer() as import('node:http').Server;
    if (!server.listening) await app.listen(0);
    const { port } = server.address() as import('node:net').AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/chats/${match.id}/stream`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    expect(response.status).toBe(200);

    await http().post(`/matches/${match.id}/unmatch`).set(as(bob.token)).send({}).expect(200);
    const body = await response.text();
    expect(body).toContain('event: closed');
  });
});

describe('account data', () => {
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function active() {
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Alice' });
    const bob = await register({ gender: 'MAN', seeking: ['WOMAN'], displayName: 'Bob' });
    const today = await http().get('/questions/today').set(as(alice.token)).expect(200);
    const first = today.body.questions[0];
    await http().post(`/questions/${first.id}/answer`).set(as(alice.token)).send({ self: 4, partner: 2, importance: 5 }).expect(201);
    const match = await prisma.match.create({
      data: { day: new Date('2026-09-23'), userAId: alice.id, userBId: bob.id, score: 0.6, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
    });
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
    expect(res.body.answers).toEqual([expect.objectContaining({ question: question.text, you: 4, partner: 2, importance: 5 })]);
    expect(Object.keys(res.body.model)).toHaveLength(8);
    expect(res.body.matches).toEqual([expect.objectContaining({ day: '2026-09-23', with: 'Bob', yourDecision: 'LIKE', mutual: true, closed: false })]);
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

describe('moderation', () => {
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function reported() {
    const admin = await register({ displayName: 'Admin' });
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Alice' });
    const mallory = await register({ gender: 'MAN', seeking: ['WOMAN'], displayName: 'Mallory' });
    const carol = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Carol' });
    const match = await prisma.match.create({
      data: { day: new Date('2026-09-23'), userAId: alice.id, userBId: mallory.id, score: 0.6, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
    });
    const other = await prisma.match.create({
      data: { day: new Date('2026-09-23'), userAId: carol.id, userBId: mallory.id, score: 0.5, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
    });
    for (const who of [alice, mallory]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    await http().post(`/chats/${match.id}/messages`).set(as(mallory.token)).send({ body: 'send me money' }).expect(201);
    await http()
      .post(`/matches/${match.id}/unmatch`)
      .set(as(alice.token))
      .send({ report: { reason: 'SPAM', note: 'asked for money' } })
      .expect(200);
    return { admin, alice, mallory, carol, other };
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
    await http().post(`/admin/reports/${report.id}/resolve`).set(as(admin.token)).send({ outcome: 'DISMISSED' }).expect(409);

    await http().get('/me').set(as(mallory.token)).expect(401);
    const login = await http().post('/auth/login').send({ email: mallory.email, password: 'correct horse battery' }).expect(403);
    expect(login.body.message).toMatch(/suspended/);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: other.id } })).closedAt).not.toBeNull();
    expect((await http().get('/matches/today').set(as(carol.token)).expect(200)).body.matches).toEqual([]);

    const reviewed = await http().get('/admin/reports?status=reviewed').set(as(admin.token)).expect(200);
    expect(reviewed.body[0]).toMatchObject({ outcome: 'BANNED', reported: { banned: true } });
  });

  it('dismisses without touching the account', async () => {
    const { admin, mallory } = await reported();
    const [report] = (await http().get('/admin/reports').set(as(admin.token)).expect(200)).body;
    await http().post(`/admin/reports/${report.id}/resolve`).set(as(admin.token)).send({ outcome: 'DISMISSED' }).expect(200);
    await http().get('/me').set(as(mallory.token)).expect(200);
    await http().post(`/admin/reports/${report.id}/resolve`).set(as(admin.token)).send({ outcome: 'NOPE' }).expect(400);
  });
});

describe('rate limits', () => {
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('slows down password guessing per account and tells you when to retry', async () => {
    const alice = await register();
    for (let i = 0; i < 10; i += 1) {
      await http().post('/auth/login').set('X-Forwarded-For', `10.0.0.${i}`).send({ email: alice.email, password: 'wrong password' }).expect(401);
    }
    const blocked = await http()
      .post('/auth/login')
      .set('X-Forwarded-For', '10.0.0.99')
      .send({ email: alice.email.toUpperCase(), password: 'correct horse battery' })
      .expect(429);
    expect(blocked.headers['retry-after']).toBe('900');
    expect(blocked.body.message).toBe('Too many attempts, try again in 15 minutes');

    clock.current = new Date(clock.current.getTime() + 15 * 60 * 1000);
    await http().post('/auth/login').send({ email: alice.email, password: 'correct horse battery' }).expect(200);
  });

  it('limits sign-ups per address but not across addresses', async () => {
    const signup = (n: number, ip: string) =>
      http()
        .post('/auth/register')
        .set('X-Forwarded-For', ip)
        .send({ email: `bulk${n}@example.com`, password: 'long enough', displayName: 'Bulk', birthDate: '1990-01-01', gender: 'MAN', seeking: ['WOMAN'], city: 'Baku' });
    for (let n = 0; n < 5; n += 1) await signup(n, '203.0.113.7').expect(201);
    await signup(5, '203.0.113.7').expect(429);
    await signup(6, '198.51.100.4').expect(201);
  });

  it('caps how fast one person can send messages', async () => {
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'] });
    const bob = await register({ gender: 'MAN', seeking: ['WOMAN'] });
    const match = await prisma.match.create({
      data: { day: new Date('2026-09-23'), userAId: alice.id, userBId: bob.id, score: 0.6, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
    });
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    for (let i = 0; i < 30; i += 1) {
      await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: `hi ${i}` }).expect(201);
    }
    const res = await http().post(`/chats/${match.id}/messages`).set(as(bob.token)).send({ body: 'one more' }).expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    await http().post(`/chats/${match.id}/messages`).set(as(alice.token)).send({ body: 'still fine for me' }).expect(201);
  });

  it('cleans up old windows', async () => {
    await prisma.rateLimit.create({ data: { key: 'old', windowStart: new Date('2026-09-20T00:00:00Z') } });
    await prisma.rateLimit.create({ data: { key: 'fresh', windowStart: new Date('2026-09-23T08:00:00Z') } });
    await app.get(RateLimiter).cleanup();
    expect((await prisma.rateLimit.findMany()).map((r) => r.key)).toEqual(['fresh']);
  });
});

describe('email digest', () => {
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const digests = () => mails.sent.filter((m) => m.headers?.['List-Unsubscribe']);

  async function nightlyPair() {
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Alice' });
    const bob = await register({ gender: 'MAN', seeking: ['WOMAN'], displayName: 'Bob' });
    const carol = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Carol' });
    for (const [a, b] of [
      [alice, bob],
      [carol, bob],
    ] as const) {
      await prisma.match.create({
        data: { day: new Date('2026-09-23'), userAId: a.id, userBId: b.id, score: 0.6, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
      });
    }
    await prisma.user.updateMany({ data: { emailVerifiedAt: new Date() } });
    return { alice, bob, carol };
  }

  it('emails people without push, skips people with push or who opted out', async () => {
    const { alice, bob, carol } = await nightlyPair();
    await http()
      .post('/push/subscriptions')
      .set(as(bob.token))
      .send({ endpoint: 'https://push.example.com/send/bob', keys: { p256dh: 'k', auth: 'a' } })
      .expect(204);
    await http().patch('/me/preferences').set(as(carol.token)).send({ emailDigest: false }).expect(200);
    await http().patch('/me/preferences').set(as(carol.token)).send({ emailDigest: 'no' }).expect(400);
    expect((await http().get('/me').set(as(carol.token)).expect(200)).body.emailDigest).toBe(false);

    const dan = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Dan' });
    await prisma.match.create({
      data: { day: new Date('2026-09-23'), userAId: dan.id, userBId: bob.id, score: 0.5, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
    });

    await app.get(MatchNotifier).deliver('2026-09-23');

    expect(digests().map((m) => m.to)).toEqual([alice.email]);
    const [mail] = digests();
    expect(mail!.subject).toBe('1 new match today');
    expect(mail!.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(pushes.sent.map((p) => p.message.tag)).toEqual(['matches']);
  });

  it('unsubscribes with the link from the email, and that link is not a login', async () => {
    const { alice } = await nightlyPair();
    await app.get(MatchNotifier).deliver('2026-09-23');
    const toAlice = digests().find((m) => m.to === alice.email)!;
    const token = new URL(toAlice.headers!['List-Unsubscribe']!.slice(1, -1)).searchParams.get('token')!;

    await http().get('/me').set(as(token)).expect(401);
    await http().post('/email/unsubscribe').query({ token: 'nonsense' }).expect(400);
    await http().post('/email/unsubscribe').query({ token: alice.token }).expect(400);
    await http().post('/email/unsubscribe').query({ token }).expect(200);
    expect((await http().get('/me').set(as(alice.token)).expect(200)).body.emailDigest).toBe(false);
  });
});

describe('account security', () => {
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const linkToken = (text: string, path: string) =>
    new URL(text.split(/\s+/).find((word) => word.includes(path))!).searchParams.get('token')!;

  it('confirms the email from the link sent at sign-up', async () => {
    const alice = await register();
    const sent = mails.sent.find((m) => m.to === alice.email)!;
    expect(sent.subject).toBe('Confirm your email for Matchium');
    expect((await http().get('/me').set(as(alice.token)).expect(200)).body.emailVerified).toBe(false);
    expect((await http().get('/inbox').set(as(alice.token)).expect(200)).body.emailVerified).toBe(false);

    const token = linkToken(sent.text, '/verify-email');
    await http().get('/me').set(as(token)).expect(401);
    await http().post('/auth/verify-email').send({ token: alice.token }).expect(400);
    await http().post('/auth/verify-email').send({ token }).expect(200);
    expect((await http().get('/me').set(as(alice.token)).expect(200)).body.emailVerified).toBe(true);
    await http().post('/auth/verify-email/resend').set(as(alice.token)).expect(409);
  });

  it('resends the confirmation a few times, then waits', async () => {
    const alice = await register();
    for (let i = 0; i < 3; i += 1) await http().post('/auth/verify-email/resend').set(as(alice.token)).expect(204);
    await http().post('/auth/verify-email/resend').set(as(alice.token)).expect(429);
    expect(mails.sent.filter((m) => m.to === alice.email)).toHaveLength(4);
  });

  it('logs out one device without touching the others', async () => {
    const alice = await register();
    const login = () => http().post('/auth/login').send({ email: alice.email, password: 'correct horse battery' }).expect(200);
    const phone = (await login()).body.accessToken as string;
    const laptop = (await login()).body.accessToken as string;

    await http().post('/auth/logout').set(as(phone)).expect(204);
    await http().get('/me').set(as(phone)).expect(401);
    await http().get('/me').set(as(laptop)).expect(200);
    await http().post('/auth/logout').expect(401);
  });

  it('resets a forgotten password once and signs every device out', async () => {
    const alice = await register();
    mails.sent = [];
    await http().post('/auth/password/forgot').send({ email: 'nobody@example.com' }).expect(204);
    expect(mails.sent).toHaveLength(0);

    await http().post('/auth/password/forgot').send({ email: alice.email.toUpperCase() }).expect(204);
    const sent = mails.sent.find((m) => m.to === alice.email)!;
    expect(sent.subject).toBe('Reset your Matchium password');
    const token = linkToken(sent.text, '/reset-password');

    await http().post('/auth/password/reset').send({ token: alice.token, password: 'a new password' }).expect(400);
    await http().post('/auth/password/reset').send({ token, password: 'short' }).expect(400);
    await http().post('/auth/password/reset').send({ token, password: 'a new password' }).expect(204);
    await http().post('/auth/password/reset').send({ token, password: 'another password' }).expect(400);

    await http().get('/me').set(as(alice.token)).expect(401);
    await http().post('/auth/login').send({ email: alice.email, password: 'correct horse battery' }).expect(401);
    const fresh = await http().post('/auth/login').send({ email: alice.email, password: 'a new password' }).expect(200);
    expect((await http().get('/me').set(as(fresh.body.accessToken)).expect(200)).body.emailVerified).toBe(true);
  });

  it('limits reset requests per address', async () => {
    const alice = await register();
    for (let i = 0; i < 3; i += 1) await http().post('/auth/password/forgot').send({ email: alice.email }).expect(204);
    await http().post('/auth/password/forgot').send({ email: alice.email }).expect(429);
  });
});

describe('photos and bio', () => {
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const jpeg = () =>
    sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#8a6' } })
      .withExif({ IFD0: { Make: 'PhoneCo' } })
      .jpeg()
      .toBuffer();

  async function upload(token: string) {
    return http().post('/me/photos').set(as(token)).attach('photo', await jpeg(), 'me.jpg');
  }

  it('stores a cleaned-up copy and lists it on the profile', async () => {
    const alice = await register();
    const res = await upload(alice.token);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ width: 1080, height: 810 });

    const me = await http().get('/me').set(as(alice.token)).expect(200);
    expect(me.body.photos).toEqual([{ id: res.body.id, width: 1080, height: 810 }]);
    const [stored] = [...photos.objects.values()];
    expect((await sharp(stored!).metadata()).exif).toBeUndefined();

    const image = await http().get(`/photos/${res.body.id}`).set(as(alice.token)).buffer(true).expect(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toBe('private, max-age=3600');
  });

  it('rejects junk and caps the number of photos', async () => {
    const alice = await register();
    await http().post('/me/photos').set(as(alice.token)).attach('photo', Buffer.from('nope'), 'x.jpg').expect(400);
    await http().post('/me/photos').set(as(alice.token)).expect(400);
    for (let i = 0; i < 4; i += 1) expect((await upload(alice.token)).status).toBe(201);
    expect((await upload(alice.token)).status).toBe(409);
  });

  it('shows photos only to people you are matched with', async () => {
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Alice' });
    const bob = await register({ gender: 'MAN', seeking: ['WOMAN'], displayName: 'Bob' });
    const stranger = await register();
    const admin = await register();
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const { id } = (await upload(alice.token)).body;
    await http().patch('/me/profile').set(as(alice.token)).send({ bio: '  Climbing, bad puns, good coffee.  ' }).expect(200);

    await http().get(`/photos/${id}`).set(as(bob.token)).expect(404);
    const match = await prisma.match.create({
      data: { day: new Date('2026-09-23'), userAId: alice.id, userBId: bob.id, score: 0.6, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
    });
    await http().get(`/photos/${id}`).set(as(bob.token)).expect(200);
    await http().get(`/photos/${id}`).set(as(stranger.token)).expect(404);
    await http().get(`/photos/${id}`).set(as(admin.token)).expect(200);

    const today = await http().get('/matches/today').set(as(bob.token)).expect(200);
    expect(today.body.matches[0].person).toMatchObject({ bio: 'Climbing, bad puns, good coffee.', photos: [{ id }] });

    await http().post(`/matches/${match.id}/unmatch`).set(as(bob.token)).send({}).expect(200);
    await http().get(`/photos/${id}`).set(as(bob.token)).expect(404);
  });

  it('deletes photos, rejects long bios and cleans storage when the account goes', async () => {
    const alice = await register();
    const first = (await upload(alice.token)).body.id;
    await upload(alice.token);
    await http().delete(`/me/photos/${first}`).set(as(alice.token)).expect(204);
    await http().delete(`/me/photos/${first}`).set(as(alice.token)).expect(404);
    expect(photos.objects.size).toBe(1);
    await http().patch('/me/profile').set(as(alice.token)).send({ bio: 'x'.repeat(301) }).expect(400);

    await http().delete('/me').set(as(alice.token)).send({ password: 'correct horse battery' }).expect(204);
    expect(photos.objects.size).toBe(0);
  });
});

describe('safety after deletion', () => {
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('keeps a report and its evidence when the reported person deletes their account, and keeps them out', async () => {
    const admin = await register();
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const alice = await register({ gender: 'WOMAN', seeking: ['MAN'], displayName: 'Alice' });
    const mallory = await register({ gender: 'MAN', seeking: ['WOMAN'], displayName: 'Mallory' });
    const match = await prisma.match.create({
      data: { day: new Date('2026-09-23'), userAId: alice.id, userBId: mallory.id, score: 0.6, confidence: 0.4, aligned: ['family'], friction: 'tidiness' },
    });
    for (const who of [alice, mallory]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    await http().post(`/chats/${match.id}/messages`).set(as(mallory.token)).send({ body: 'wire me 500 AZN' }).expect(201);
    await http().post(`/matches/${match.id}/unmatch`).set(as(alice.token)).send({ report: { reason: 'SPAM' } }).expect(200);

    await http().delete('/me').set(as(mallory.token)).send({ password: 'correct horse battery' }).expect(204);

    const [report] = (await http().get('/admin/reports').set(as(admin.token)).expect(200)).body;
    expect(report).toMatchObject({
      matchedOn: null,
      reported: { id: null, deleted: true, displayName: 'Mallory', email: mallory.email, reportsAgainst: 1 },
      messages: [{ from: 'reported', body: 'wire me 500 AZN' }],
    });

    await http().post(`/admin/reports/${report.id}/resolve`).set(as(admin.token)).send({ outcome: 'BANNED' }).expect(200);
    const again = await http()
      .post('/auth/register')
      .send({ email: mallory.email.toUpperCase(), password: 'another password', displayName: 'M', birthDate: '1990-01-01', gender: 'MAN', seeking: ['WOMAN'], city: 'Baku' })
      .expect(403);
    expect(again.body.message).toMatch(/can't be used/);
  });

  it('signs out every device at once', async () => {
    const alice = await register();
    const second = (await http().post('/auth/login').send({ email: alice.email, password: 'correct horse battery' }).expect(200)).body
      .accessToken as string;
    await http().post('/auth/logout-all').set(as(alice.token)).expect(204);
    await http().get('/me').set(as(alice.token)).expect(401);
    await http().get('/me').set(as(second)).expect(401);
  });

  it('sweeps revoked and expired sessions but keeps live ones', async () => {
    const alice = await register();
    const now = clock.now().getTime();
    const day = 24 * 60 * 60 * 1000;
    await prisma.session.createMany({
      data: [
        { userId: alice.id, createdAt: new Date(now - 3 * day), revokedAt: new Date(now - 2 * day) },
        { userId: alice.id, createdAt: new Date(now - 9 * day) },
        { userId: alice.id, createdAt: new Date(now - day), revokedAt: new Date(now - 60 * 1000) },
      ],
    });
    expect(await app.get(SessionSweeper).sweep()).toBe(2);
    expect(await prisma.session.count({ where: { userId: alice.id } })).toBe(2);
    await http().get('/me').set(as(alice.token)).expect(200);
  });
});

