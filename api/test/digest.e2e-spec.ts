import { MatchNotifier } from '../src/notifications/match-notifier.js';
import { app, http, mails, prisma, pushes, useTestApp } from './support/app.js';
import { as, createMatch, man, woman } from './support/builders.js';

useTestApp();

describe('email digest', () => {
  const digests = () => mails.sent.filter((m) => m.headers?.['List-Unsubscribe']);

  async function nightlyPair() {
    const alice = await woman('Alice');
    const bob = await man('Bob');
    const carol = await woman('Carol');
    await createMatch(alice, bob);
    await createMatch(carol, bob);
    await prisma.user.updateMany({ data: { emailVerifiedAt: new Date() } });
    return { alice, bob, carol };
  }

  it('emails people without push, skips people with push, who opted out or never confirmed', async () => {
    const { alice, bob, carol } = await nightlyPair();
    await http()
      .post('/push/subscriptions')
      .set(as(bob.token))
      .send({ endpoint: 'https://push.example.com/send/bob', keys: { p256dh: 'k', auth: 'a' } })
      .expect(204);
    await http().patch('/me/preferences').set(as(carol.token)).send({ emailDigest: false }).expect(200);
    await http().patch('/me/preferences').set(as(carol.token)).send({ emailDigest: 'no' }).expect(400);
    expect((await http().get('/me').set(as(carol.token)).expect(200)).body.emailDigest).toBe(false);

    const dan = await woman('Dan');
    await prisma.user.update({ where: { id: dan.id }, data: { emailVerifiedAt: null } });
    await createMatch(dan, bob, { score: 0.5 });

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
    await http().post('/email/unsubscribe').expect(400);
    await http().post('/email/unsubscribe').query({ token: '' }).expect(400);
    await http().post('/email/unsubscribe').query({ token: 'nonsense' }).expect(410);
    await http().post('/email/unsubscribe').query({ token: alice.token }).expect(410);
    await http().post('/email/unsubscribe').query({ token }).expect(200);
    expect((await http().get('/me').set(as(alice.token)).expect(200)).body.emailDigest).toBe(false);
  });
});
