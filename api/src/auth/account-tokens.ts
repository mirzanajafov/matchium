import { createHash } from 'node:crypto';

export const VERIFY_PURPOSE = 'verify-email';
export const RESET_PURPOSE = 'reset-password';

export function passwordStamp(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('base64url').slice(0, 16);
}
