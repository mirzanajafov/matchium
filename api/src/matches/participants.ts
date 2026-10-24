import type { Prisma } from '../generated/prisma/client.js';

interface Pair {
  userAId: string;
  userBId: string;
}

interface Decision {
  userId: string;
  liked: boolean;
}

export type Verdict = 'LIKE' | 'PASS';

export function involving(userId: string): Prisma.MatchWhereInput {
  return { OR: [{ userAId: userId }, { userBId: userId }] };
}

export function isParticipant(match: Pair, userId: string): boolean {
  return match.userAId === userId || match.userBId === userId;
}

export function otherUserId(match: Pair, userId: string): string {
  return match.userAId === userId ? match.userBId : match.userAId;
}

export function counterpart<Person>(match: Pair & { userA: Person; userB: Person }, userId: string): Person {
  return match.userAId === userId ? match.userB : match.userA;
}

export function decisionOf(decisions: readonly Decision[], userId: string): Verdict | null {
  const decision = decisions.find((d) => d.userId === userId);
  if (!decision) return null;
  return decision.liked ? 'LIKE' : 'PASS';
}

export function isMutual(match: Pair & { decisions: readonly Decision[] }): boolean {
  return decisionOf(match.decisions, match.userAId) === 'LIKE' && decisionOf(match.decisions, match.userBId) === 'LIKE';
}
