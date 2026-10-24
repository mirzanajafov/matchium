import type { Prisma } from '../generated/prisma/client.js';

export const SESSION_LIFETIME_DAYS = 7;

export function revokeSessions(db: Prisma.TransactionClient, userId: string, at: Date) {
  return db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: at } });
}
