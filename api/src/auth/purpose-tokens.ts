import { GoneException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';

export const SIGNUP_LIFETIME_DAYS = 3;
export const INVALID_LINK = 'This link is not valid';

interface Claims {
  'verify-email': { sub: string; email: string };
  'reset-password': { sub: string; stamp: string };
  'confirm-signup': { email: string; stamp: string };
  unsubscribe: { sub: string };
}

type Purpose = keyof Claims;

const LIFETIMES: Record<Purpose, `${number}${'m' | 'd'}`> = {
  'verify-email': '3d',
  'reset-password': '30m',
  'confirm-signup': `${SIGNUP_LIFETIME_DAYS}d`,
  unsubscribe: '365d',
};

export function passwordStamp(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('base64url').slice(0, 16);
}

@Injectable()
export class PurposeTokens {
  constructor(private readonly jwt: JwtService) {}

  sign<P extends Purpose>(purpose: P, claims: Claims[P]): string {
    return this.jwt.sign({ ...claims, purpose }, { expiresIn: LIFETIMES[purpose] });
  }

  async read<P extends Purpose>(token: string, purpose: P): Promise<Claims[P]> {
    let payload: Claims[P] & { purpose?: string };
    try {
      payload = await this.jwt.verifyAsync<Claims[P] & { purpose?: string }>(token);
    } catch {
      throw new GoneException(INVALID_LINK);
    }
    if (payload.purpose !== purpose) throw new GoneException(INVALID_LINK);
    return payload;
  }
}
