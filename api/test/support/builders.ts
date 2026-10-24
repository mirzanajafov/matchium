import type { Prisma } from '../../src/generated/prisma/client.js';
import { app, http, mails, prisma } from './app.js';

let counter = 0;

export function as(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function linkToken(text: string, path: string): string {
  const link = text.split(/\s+/).find((word) => word.includes(path));
  if (!link) throw new Error(`No ${path} link in the email`);
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error(`The ${path} link has no token`);
  return token;
}

export function signup(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    email: `user${counter}@example.com`,
    password: 'correct horse battery',
    displayName: `User ${counter}`,
    birthDate: '1995-04-12',
    gender: 'WOMAN',
    seeking: ['MAN'],
    city: 'Baku',
    ...overrides,
  };
}

export function finishSignup(email: string, password: string) {
  const sent = mails.sent.findLast((m) => m.to === email && m.subject === 'Finish signing up for Matchium');
  if (!sent) throw new Error(`No sign-up email went to ${email}`);
  return http()
    .post('/auth/confirm-signup')
    .send({ token: linkToken(sent.text, '/confirm-signup'), password });
}

async function signedIn(token: string, email: string) {
  const me = await http().get('/me').set(as(token)).expect(200);
  return { token, id: me.body.id as string, email };
}

export async function register(overrides: Record<string, unknown> = {}) {
  const body = signup(overrides);
  await http().post('/auth/register').send(body).expect(201, { checkEmail: true });
  const finished = await finishSignup(body.email, body.password).expect(200);
  return signedIn(finished.body.accessToken, body.email);
}

export async function registerWithoutEmail(overrides: Record<string, unknown> = {}) {
  mails.enabled = false;
  const body = signup(overrides);
  const res = await http().post('/auth/register').send(body).expect(201);
  mails.enabled = true;
  return signedIn(res.body.accessToken, body.email);
}

export function woman(displayName: string) {
  return register({ gender: 'WOMAN', seeking: ['MAN'], displayName });
}

export function man(displayName: string) {
  return register({ gender: 'MAN', seeking: ['WOMAN'], displayName });
}

export async function registerAdmin() {
  const admin = await register({ displayName: 'Admin' });
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  return admin;
}

export async function matchedPair() {
  const alice = await woman('Alice');
  const bob = await man('Bob');
  return { alice, bob, match: await createMatch(alice, bob) };
}

export async function openChatStream(matchId: string, token: string, signal?: AbortSignal) {
  return fetch(`${await app.getUrl()}/chats/${matchId}/stream`, { headers: as(token), signal });
}

export function createMatch(
  userA: { id: string },
  userB: { id: string },
  fields: Partial<Pick<Prisma.MatchUncheckedCreateInput, 'score' | 'confidence' | 'aligned' | 'friction'>> = {},
) {
  return prisma.match.create({
    data: {
      day: new Date('2026-09-23'),
      userAId: userA.id,
      userBId: userB.id,
      score: 0.6,
      confidence: 0.4,
      aligned: ['family'],
      friction: 'tidiness',
      ...fields,
    },
  });
}
