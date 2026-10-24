import { RateLimiter } from '../src/limits/rate-limiter.js';
import { app, clock, http, mails, prisma, useTestApp } from './support/app.js';
import { as, matchedPair, register, signup } from './support/builders.js';

useTestApp();

describe('rate limits', () => {
  it('slows down password guessing per account and tells you when to retry', async () => {
    const alice = await register();
    for (let i = 0; i < 10; i += 1) {
      await http()
        .post('/auth/login')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .send({ email: alice.email, password: 'wrong password' })
        .expect(401);
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

  it('limits sign-ups per network address but not across addresses', async () => {
    const attempt = (ip: string) => http().post('/auth/register').set('X-Forwarded-For', ip).send(signup());
    for (let n = 0; n < 5; n += 1) await attempt('203.0.113.7').expect(201);
    await attempt('203.0.113.7').expect(429);
    await attempt('198.51.100.4').expect(201);
  });

  it('sends one inbox three sign-up emails an hour at most, whether or not it has an account', async () => {
    const attempt = (email: string, ip: string) =>
      http().post('/auth/register').set('X-Forwarded-For', ip).send(signup({ email }));
    const owner = await register();
    const newcomer = signup().email;
    for (const ip of ['203.0.113.1', '203.0.113.2']) await attempt(owner.email, ip).expect(201, { checkEmail: true });
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      await attempt(newcomer, ip).expect(201, { checkEmail: true });
    }
    await attempt(owner.email, '203.0.113.4').expect(429);
    await attempt(newcomer, '203.0.113.4').expect(429);
    expect(mails.sent.filter((m) => m.to === owner.email).map((m) => m.subject)).toEqual([
      'Finish signing up for Matchium',
      'You already have a Matchium account',
      'You already have a Matchium account',
    ]);
    expect(mails.sent.filter((m) => m.to === newcomer)).toHaveLength(3);
  });

  it('caps how fast one person can send messages', async () => {
    const { alice, bob, match } = await matchedPair();
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    for (let i = 0; i < 30; i += 1) {
      await http()
        .post(`/chats/${match.id}/messages`)
        .set(as(bob.token))
        .send({ body: `hi ${i}` })
        .expect(201);
    }
    const res = await http()
      .post(`/chats/${match.id}/messages`)
      .set(as(bob.token))
      .send({ body: 'one more' })
      .expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    await http()
      .post(`/chats/${match.id}/messages`)
      .set(as(alice.token))
      .send({ body: 'still fine for me' })
      .expect(201);
  });

  it('cleans up old windows', async () => {
    await prisma.rateLimit.create({ data: { key: 'old', windowStart: new Date('2026-09-20T00:00:00Z') } });
    await prisma.rateLimit.create({ data: { key: 'fresh', windowStart: new Date('2026-09-23T08:00:00Z') } });
    await app.get(RateLimiter).cleanup();
    expect((await prisma.rateLimit.findMany()).map((r) => r.key)).toEqual(['fresh']);
  });
});
