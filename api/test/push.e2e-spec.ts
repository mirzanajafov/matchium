import { MatchNotifier } from '../src/notifications/match-notifier.js';
import { app, prisma, pushes, http, useTestApp } from './support/app.js';
import { as, register, matchedPair } from './support/builders.js';

useTestApp();

describe('push notifications', () => {
  const subscription = (n: number) => ({
    endpoint: `https://push.example.com/send/${n}`,
    keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` },
  });
  const sentTo = (endpoint: string) => pushes.sent.filter((p) => p.endpoint === endpoint).map((p) => p.message);

  it('hands out the public key and validates subscriptions', async () => {
    expect((await http().get('/push/key').expect(200)).body).toEqual({ publicKey: 'test-public-key' });
    const alice = await register();
    await http().post('/push/subscriptions').send(subscription(1)).expect(401);
    await http()
      .post('/push/subscriptions')
      .set(as(alice.token))
      .send({ ...subscription(1), endpoint: 'http://push.example.com/insecure' })
      .expect(400);
    await http()
      .post('/push/subscriptions')
      .set(as(alice.token))
      .send({ endpoint: subscription(1).endpoint, keys: {} })
      .expect(400);
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

    await http()
      .delete('/push/subscriptions')
      .set(as(alice.token))
      .send({ endpoint: subscription(2).endpoint })
      .expect(204);
    expect(await prisma.pushSubscription.count()).toBe(1);
    await http()
      .delete('/push/subscriptions')
      .set(as(bob.token))
      .send({ endpoint: subscription(2).endpoint })
      .expect(204);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('tells the other person about a mutual like and new messages, and drops dead endpoints', async () => {
    const { alice, bob, match } = await matchedPair();
    await http().post('/push/subscriptions').set(as(alice.token)).send(subscription(3)).expect(204);
    await http().post('/push/subscriptions').set(as(bob.token)).send(subscription(4)).expect(204);

    await http().post(`/matches/${match.id}/decision`).set(as(alice.token)).send({ like: true }).expect(200);
    await http().post(`/matches/${match.id}/decision`).set(as(bob.token)).send({ like: true }).expect(200);
    await vi.waitFor(() => expect(sentTo(subscription(3).endpoint)).toHaveLength(1));
    expect(sentTo(subscription(3).endpoint)[0]).toMatchObject({ title: "It's mutual", url: `/chats/${match.id}` });
    expect(sentTo(subscription(4).endpoint)).toHaveLength(0);

    await http()
      .post(`/chats/${match.id}/messages`)
      .set(as(bob.token))
      .send({ body: 'Coffee on Saturday?' })
      .expect(201);
    await vi.waitFor(() => expect(sentTo(subscription(3).endpoint)).toHaveLength(2));
    expect(sentTo(subscription(3).endpoint)[1]).toEqual({
      title: 'Bob',
      body: 'Coffee on Saturday?',
      url: `/chats/${match.id}`,
      tag: `chat-${match.id}`,
    });

    pushes.gone.add(subscription(3).endpoint);
    await http()
      .post(`/chats/${match.id}/messages`)
      .set(as(bob.token))
      .send({ body: 'x'.repeat(300) })
      .expect(201);
    await vi.waitFor(async () => expect(await prisma.pushSubscription.count({ where: { userId: alice.id } })).toBe(0));
  });

  it(
    'reports a mutual like once and tells whoever liked first when both say yes at the same moment',
    { repeats: 4 },
    async () => {
      const { alice, bob, match } = await matchedPair();
      await http().post('/push/subscriptions').set(as(alice.token)).send(subscription(7)).expect(204);
      await http().post('/push/subscriptions').set(as(bob.token)).send(subscription(8)).expect(204);

      const like = (person: { token: string }) =>
        http().post(`/matches/${match.id}/decision`).set(as(person.token)).send({ like: true }).expect(200);
      const [aliceLike, bobLike] = await Promise.all([like(alice), like(bob)]);
      expect([aliceLike.body.mutual, bobLike.body.mutual].filter(Boolean)).toHaveLength(1);
      const firstToLike = aliceLike.body.mutual ? subscription(8) : subscription(7);
      await vi.waitFor(() => expect(sentTo(firstToLike.endpoint)).toHaveLength(1));
      expect(pushes.sent).toHaveLength(1);
    },
  );

  it('announces the nightly matches once, even if the signal arrives twice, and skips malformed signals', async () => {
    const { alice, bob } = await matchedPair();
    await http().post('/push/subscriptions').set(as(alice.token)).send(subscription(5)).expect(204);
    await http().post('/push/subscriptions').set(as(bob.token)).send(subscription(6)).expect(204);

    const deliver = vi.spyOn(app.get(MatchNotifier), 'deliver');
    for (const payload of ['not json', '{"day":"not a day"}', '{"day":"2026-02-30"}', '{"day":"2026-09-23"}']) {
      await prisma.$executeRaw`SELECT pg_notify('matches_ready', ${payload})`;
    }
    await vi.waitFor(() => expect(pushes.sent).toHaveLength(2));
    expect(deliver.mock.calls).toEqual([['2026-09-23']]);
    deliver.mockRestore();
    expect(sentTo(subscription(5).endpoint)[0]).toMatchObject({ body: 'You have a new match today.', url: '/today' });

    expect(await app.get(MatchNotifier).deliver('2026-09-23')).toBe(0);
    expect(pushes.sent).toHaveLength(2);
  });
});
