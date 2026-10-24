import { AuthSweeper } from '../src/auth/auth-sweeper.js';
import { app, prisma, clock, mails, http, useTestApp } from './support/app.js';
import { as, linkToken, signup, finishSignup, register, registerWithoutEmail } from './support/builders.js';

useTestApp();

describe('auth', () => {
  it('registers, logs in and rejects bad credentials', async () => {
    const user = await register();
    await http().post('/auth/login').send({ email: user.email, password: 'correct horse battery' }).expect(200);
    await http().post('/auth/login').send({ email: user.email, password: 'wrong password' }).expect(401);
    await http().post('/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' }).expect(401);
  });

  it('makes the account only when the emailed link is opened with the password chosen', async () => {
    const body = signup();
    await http().post('/auth/register').send(body).expect(201, { checkEmail: true });
    expect(await prisma.user.count({ where: { email: body.email } })).toBe(0);
    await http().post('/auth/login').send({ email: body.email, password: body.password }).expect(401);

    await finishSignup(body.email, 'not the password').expect(401);
    const finished = await finishSignup(body.email, body.password).expect(200);
    const me = await http().get('/me').set(as(finished.body.accessToken)).expect(200);
    expect(me.body).toMatchObject({ email: body.email, emailVerified: true });
    await finishSignup(body.email, body.password).expect(410);
  });

  it('answers a sign-up for a taken address like any other and tells the owner instead', async () => {
    const user = await register();
    mails.sent = [];
    await http()
      .post('/auth/register')
      .send(signup({ email: user.email.toUpperCase(), password: 'another password' }))
      .expect(201, { checkEmail: true });

    expect(mails.sent.map((m) => [m.to, m.subject])).toEqual([[user.email, 'You already have a Matchium account']]);
    expect(await prisma.pendingSignup.count()).toBe(0);
    await http().post('/auth/login').send({ email: user.email, password: 'another password' }).expect(401);
  });

  it('forgets a sign-up nobody finished within three days', async () => {
    const body = signup();
    await http().post('/auth/register').send(body).expect(201);
    clock.current = new Date(clock.current.getTime() + 3 * 24 * 60 * 60 * 1000 + 1000);
    expect(await app.get(AuthSweeper).sweep()).toEqual({ sessions: 0, signups: 1 });
    await finishSignup(body.email, body.password).expect(410);
  });

  it('refuses to finish a sign-up for an address banned in the meantime', async () => {
    const body = signup();
    await http().post('/auth/register').send(body).expect(201);
    await prisma.report.create({
      data: { reason: 'SPAM', reportedName: 'Someone', reportedEmail: body.email, outcome: 'BANNED' },
    });
    await finishSignup(body.email, body.password).expect(410);
  });

  it('stops password guesses at one sign-up link after five an hour, but not at a fresh link', async () => {
    const body = signup();
    await http().post('/auth/register').send(body).expect(201);
    for (let i = 0; i < 5; i += 1) await finishSignup(body.email, `wrong guess ${i}`).expect(401);
    const blocked = await finishSignup(body.email, body.password).expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    await http().post('/auth/register').send(body).expect(201);
    await finishSignup(body.email, body.password).expect(200);
  });

  it('sends a sign-up finished after the address got an account some other way to log in', async () => {
    const body = signup();
    await http().post('/auth/register').send(body).expect(201);
    mails.enabled = false;
    await http().post('/auth/register').send(body).expect(201);
    mails.enabled = true;
    await finishSignup(body.email, body.password).expect(409);
    expect(await prisma.pendingSignup.count()).toBe(0);
  });

  it('lets only the last sign-up for an address be finished, and only with its own password', async () => {
    const owner = signup();
    await http()
      .post('/auth/register')
      .send({ ...owner, password: 'chosen by someone else' })
      .expect(201, { checkEmail: true });
    const theirs = linkToken(mails.sent.findLast((m) => m.to === owner.email)!.text, '/confirm-signup');

    await http().post('/auth/register').send(owner).expect(201, { checkEmail: true });
    await http().post('/auth/confirm-signup').send({ token: theirs, password: 'chosen by someone else' }).expect(410);
    await finishSignup(owner.email, owner.password).expect(200);
    await http().post('/auth/login').send({ email: owner.email, password: 'chosen by someone else' }).expect(401);
  });

  it('leaves an account made while email was off alone, and it still logs in', async () => {
    const earlier = await registerWithoutEmail();
    await http()
      .post('/auth/register')
      .send(signup({ email: earlier.email, password: 'another password', displayName: 'Someone else' }))
      .expect(201, { checkEmail: true });

    expect(mails.sent.map((m) => m.subject)).toEqual(['You already have a Matchium account']);
    await http().post('/auth/login').send({ email: earlier.email, password: 'correct horse battery' }).expect(200);
    expect((await http().get('/me').set(as(earlier.token)).expect(200)).body).toMatchObject({
      displayName: expect.not.stringMatching('Someone else'),
      emailVerified: false,
    });
  });

  it('signs a new account in at once and refuses a taken address when email is off', async () => {
    mails.enabled = false;
    const body = signup();
    const res = await http().post('/auth/register').send(body).expect(201);
    await http().get('/me').set(as(res.body.accessToken)).expect(200);
    await http().post('/auth/register').send(body).expect(409);
    expect(mails.sent).toEqual([]);
  });

  it('rejects minors and malformed input', async () => {
    await http()
      .post('/auth/register')
      .send({
        email: 'kid@example.com',
        password: 'long enough',
        displayName: 'Kid',
        birthDate: '2010-01-01',
        gender: 'MAN',
        seeking: ['WOMAN'],
        city: 'Baku',
      })
      .expect(400);
    await http()
      .post('/auth/register')
      .send({
        email: 'x@example.com',
        password: 'long enough',
        displayName: 'X',
        birthDate: '1990-01-01',
        gender: 'ROBOT',
        seeking: [],
        city: 'Baku',
        admin: true,
      })
      .expect(400);
  });

  it('protects private routes', async () => {
    await http().get('/me').expect(401);
    await http().get('/me').set('Authorization', 'Bearer not-a-token').expect(401);
    await http().get('/health').expect(200);
  });
});

describe('account security', () => {
  const resetLink = async (email: string) => {
    await http().post('/auth/password/forgot').send({ email }).expect(204);
    const sent = mails.sent.findLast((m) => m.to === email.toLowerCase());
    if (sent?.subject !== 'Reset your Matchium password') throw new Error(`No reset email went to ${email}`);
    return linkToken(sent.text, '/reset-password');
  };

  const confirmLink = async (token: string, email: string) => {
    await http().post('/auth/verify-email/resend').set(as(token)).expect(204);
    const sent = mails.sent.findLast((m) => m.to === email);
    if (sent?.subject !== 'Confirm your email for Matchium') throw new Error(`No confirmation went to ${email}`);
    return linkToken(sent.text, '/verify-email');
  };

  it('confirms an account made while email was off from the emailed link, which never logs anyone in', async () => {
    const alice = await registerWithoutEmail();
    expect((await http().get('/inbox').set(as(alice.token)).expect(200)).body).toMatchObject({
      emailVerified: false,
      emailEnabled: true,
    });
    const token = await confirmLink(alice.token, alice.email);
    await http().get('/me').set(as(token)).expect(401);
    await http().post('/auth/verify-email').send({ token: alice.token }).expect(410);
    await http().post('/auth/verify-email').send({ token }).expect(200);
    expect((await http().get('/me').set(as(alice.token)).expect(200)).body.emailVerified).toBe(true);
    await http().post('/auth/verify-email/resend').set(as(alice.token)).expect(409);
  });

  it('refuses a confirmation link for an address the account no longer has', async () => {
    const alice = await registerWithoutEmail();
    const token = await confirmLink(alice.token, alice.email);
    await prisma.user.update({ where: { id: alice.id }, data: { email: 'moved@example.com' } });
    await http().post('/auth/verify-email').send({ token }).expect(410);
  });

  it('resends the confirmation a few times, then waits', async () => {
    const alice = await registerWithoutEmail();
    for (let i = 0; i < 3; i += 1) await http().post('/auth/verify-email/resend').set(as(alice.token)).expect(204);
    await http().post('/auth/verify-email/resend').set(as(alice.token)).expect(429);
    expect(mails.sent.filter((m) => m.to === alice.email)).toHaveLength(3);
  });

  it('logs out one device without touching the others', async () => {
    const alice = await register();
    const login = () =>
      http().post('/auth/login').send({ email: alice.email, password: 'correct horse battery' }).expect(200);
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

    const token = await resetLink(alice.email.toUpperCase());

    await http().post('/auth/password/reset').send({ token: alice.token, password: 'a new password' }).expect(410);
    await http().post('/auth/password/reset').send({ token: 'abc123', password: 'a new password' }).expect(410);
    await http().post('/auth/password/reset').send({ token, password: 'short' }).expect(400);
    await http()
      .post('/auth/password/reset')
      .send({ token, password: 'x'.repeat(129) })
      .expect(400);
    await http().post('/auth/password/reset').send({ token, password: 'a new password' }).expect(204);
    await http().post('/auth/password/reset').send({ token, password: 'another password' }).expect(410);

    await http().get('/me').set(as(alice.token)).expect(401);
    await http().post('/auth/login').send({ email: alice.email, password: 'correct horse battery' }).expect(401);
    const fresh = await http().post('/auth/login').send({ email: alice.email, password: 'a new password' }).expect(200);
    expect((await http().get('/me').set(as(fresh.body.accessToken)).expect(200)).body.emailVerified).toBe(true);
  });

  it('uses a reset link once, even when it is sent twice at the same moment', async () => {
    const alice = await register();
    const token = await resetLink(alice.email);
    const reset = async () =>
      (await http().post('/auth/password/reset').send({ token, password: 'a new password' })).status;
    const statuses = await Promise.all([reset(), reset()]);
    expect(statuses).toContain(204);
    expect(statuses).toContain(410);
  });

  it('refuses a reset link for an account banned while the new password was being hashed', async () => {
    const alice = await register();
    const token = await resetLink(alice.email);
    let reset = Promise.resolve(0);
    let status = 0;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: alice.id }, data: { bannedAt: new Date() } });
        reset = http()
          .post('/auth/password/reset')
          .send({ token, password: 'a new password' })
          .then((res) => res.status);
        await vi.waitFor(
          async () => {
            const [blocked] = await tx.$queryRaw<{ count: number }[]>`
              SELECT count(*)::int AS count FROM (SELECT DISTINCT pid FROM pg_locks WHERE NOT granted) waiting
              WHERE pg_blocking_pids(pid) @> ARRAY[pg_backend_pid()]`;
            expect(blocked?.count).toBe(1);
          },
          { timeout: 3000 },
        );
      });
    } finally {
      status = await reset;
    }
    expect(status).toBe(410);
  });

  it('answers sign-up, resend and reset requests without waiting for the mail server', async () => {
    const alice = await registerWithoutEmail();
    mails.server = 'stalled';
    await http().post('/auth/register').send(signup()).expect(201);
    await http()
      .post('/auth/register')
      .send(signup({ email: alice.email }))
      .expect(201);
    await http().post('/auth/verify-email/resend').set(as(alice.token)).expect(204);
    await http().post('/auth/password/forgot').send({ email: alice.email }).expect(204);
    expect(mails.sent.map((m) => m.subject)).toEqual([
      'Finish signing up for Matchium',
      'You already have a Matchium account',
      'Confirm your email for Matchium',
      'Reset your Matchium password',
    ]);
  });

  it('still answers when the mail server refuses the email', async () => {
    mails.server = 'down';
    const alice = await register();
    await http().post('/auth/password/forgot').send({ email: alice.email }).expect(204);
    await vi.waitFor(() => expect(mails.sent).toHaveLength(2));
  });

  it('limits reset requests per address', async () => {
    const alice = await register();
    for (let i = 0; i < 3; i += 1) await http().post('/auth/password/forgot').send({ email: alice.email }).expect(204);
    await http().post('/auth/password/forgot').send({ email: alice.email }).expect(429);
  });
});
