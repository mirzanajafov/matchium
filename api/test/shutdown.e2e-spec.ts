import sharp from 'sharp';
import request from 'supertest';
import type { Mail } from '../src/mail/mailer.js';
import { prisma, http, startApp, useTestApp } from './support/app.js';
import { as, register, matchedPair } from './support/builders.js';
import { FakeMailer, FakePhotoStore } from './support/fakes.js';

useTestApp();

describe('shutdown', { timeout: 15_000 }, () => {
  class HeldMailer extends FakeMailer {
    holding = 0;
    open: () => void = () => undefined;
    private readonly opened = new Promise<void>((resolve) => {
      this.open = resolve;
    });

    async send(mail: Mail): Promise<void> {
      this.holding += 1;
      await this.opened;
      await super.send(mail);
    }
  }

  class HeldPhotoStore extends FakePhotoStore {
    holding = false;
    release: () => void = () => undefined;

    put(key: string, body: Buffer): Promise<void> {
      this.holding = true;
      return new Promise((resolve) => {
        this.release = () => {
          this.release = () => undefined;
          resolve(super.put(key, body));
        };
      });
    }
  }

  it('finishes the match emails it has started, and turns new requests away meanwhile', async () => {
    const { alice, bob } = await matchedPair();
    await prisma.user.updateMany({ data: { emailVerifiedAt: new Date() } });
    const mailer = new HeldMailer();
    const restarting = await startApp({ mailer });
    let closing: Promise<void> | undefined;
    try {
      await vi.waitFor(() => expect(mailer.holding).toBe(2));
      closing = restarting.close();
      const refused = await fetch(`${await restarting.getUrl()}/health`);
      expect([refused.status, refused.headers.get('connection')]).toEqual([503, 'close']);

      mailer.open();
      await closing;
      const digests = mailer.sent.filter((mail) => mail.headers?.['List-Unsubscribe']);
      expect(digests.map((mail) => mail.to).toSorted()).toEqual([alice.email, bob.email].toSorted());
    } finally {
      mailer.open();
      await (closing ?? restarting.close());
    }
  });

  it('ends open chat streams so the shutdown can finish', async () => {
    const { alice, bob, match } = await matchedPair();
    for (const who of [alice, bob]) {
      await http().post(`/matches/${match.id}/decision`).set(as(who.token)).send({ like: true }).expect(200);
    }
    const restarting = await startApp();
    let closing: Promise<void> | undefined;
    try {
      const stream = await fetch(`${await restarting.getUrl()}/chats/${match.id}/stream`, { headers: as(alice.token) });
      expect(stream.status).toBe(200);
      closing = restarting.close();
      await closing;
      await stream.text();
    } finally {
      await (closing ?? restarting.close());
    }
  });

  it('lets a request already being served finish before the database closes', async () => {
    const alice = await register();
    const store = new HeldPhotoStore();
    const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#8a6' } })
      .jpeg()
      .toBuffer();
    const restarting = await startApp({ store });
    let closing: Promise<void> | undefined;
    try {
      const upload = request(restarting.getHttpServer())
        .post('/me/photos')
        .set(as(alice.token))
        .attach('photo', photo, 'me.jpg')
        .then((res) => res.status);
      await vi.waitFor(() => expect(store.holding).toBe(true));
      closing = restarting.close();
      await vi.waitFor(() => expect(restarting.getHttpServer().listening).toBe(false));
      store.release();
      expect(await upload).toBe(201);
    } finally {
      store.release();
      await (closing ?? restarting.close());
    }
  });
});
