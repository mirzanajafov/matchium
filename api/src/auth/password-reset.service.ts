import { GoneException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Clock } from '../common/clock.js';
import type { Env } from '../config/env.js';
import { passwordResetEmail } from '../mail/emails.js';
import { Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { INVALID_LINK, PurposeTokens, passwordStamp } from './purpose-tokens.js';
import { revokeSessions } from './sessions.js';

@Injectable()
export class PasswordResetService {
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
    private readonly tokens: PurposeTokens,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  async request(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.bannedAt || !this.mailer.enabled) return;
    const token = this.tokens.sign('reset-password', { sub: user.id, stamp: passwordStamp(user.passwordHash) });
    const mail = passwordResetEmail(user.displayName, `${this.webUrl}/reset-password?token=${token}`);
    void this.mailer.deliver('reset', { to: user.email, ...mail });
  }

  async reset(token: string, password: string) {
    const { sub, stamp } = await this.tokens.read(token, 'reset-password');
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user || user.bannedAt || passwordStamp(user.passwordHash) !== stamp) {
      throw new GoneException(INVALID_LINK);
    }
    const now = this.clock.now();
    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash, bannedAt: null },
        data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now },
      });
      if (changed.count === 0) throw new GoneException(INVALID_LINK);
      await revokeSessions(tx, user.id, now);
    });
  }
}
