import { ConflictException, GoneException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../common/clock.js';
import type { Env } from '../config/env.js';
import { verificationEmail } from '../mail/emails.js';
import { Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { INVALID_LINK, PurposeTokens } from './purpose-tokens.js';

@Injectable()
export class EmailVerificationService {
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

  async resend(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) throw new ConflictException('Your email is already confirmed');
    if (!this.mailer.enabled) return;
    const token = this.tokens.sign('verify-email', { sub: user.id, email: user.email });
    const mail = verificationEmail(user.displayName, `${this.webUrl}/verify-email?token=${token}`);
    void this.mailer.deliver('verify', { to: user.email, ...mail });
  }

  async confirm(token: string) {
    const { sub, email } = await this.tokens.read(token, 'verify-email');
    const updated = await this.prisma.user.updateMany({
      where: { id: sub, email },
      data: { emailVerifiedAt: this.clock.now() },
    });
    if (updated.count === 0) throw new GoneException(INVALID_LINK);
  }
}
