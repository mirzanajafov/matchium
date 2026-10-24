import { GoneException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INVALID_LINK, PurposeTokens } from '../auth/purpose-tokens.js';
import { ChatsService } from '../chats/chats.service.js';
import type { Env } from '../config/env.js';
import { digestEmail } from '../mail/emails.js';
import { Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DigestService {
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly tokens: PurposeTokens,
    private readonly chats: ChatsService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  async send(userId: string, newMatches: number): Promise<void> {
    if (!this.mailer.enabled) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, emailDigest: true, emailVerifiedAt: true, bannedAt: true },
    });
    if (!user?.emailDigest || !user.emailVerifiedAt || user.bannedAt) return;

    const unreadChats = await this.chats.unreadCount(userId);
    if (newMatches === 0 && unreadChats === 0) return;

    const token = encodeURIComponent(this.tokens.sign('unsubscribe', { sub: userId }));
    const unsubscribeUrl = `${this.webUrl}/unsubscribe?token=${token}`;
    const oneClickUrl = `${this.webUrl}/api/unsubscribe?token=${token}`;
    const mail = digestEmail({ name: user.displayName, newMatches, unreadChats, webUrl: this.webUrl, unsubscribeUrl });
    await this.mailer.deliver('digest', {
      to: user.email,
      ...mail,
      headers: { 'List-Unsubscribe': `<${oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
  }

  async unsubscribe(token: string) {
    const { sub } = await this.tokens.read(token, 'unsubscribe');
    const updated = await this.prisma.user.updateMany({ where: { id: sub }, data: { emailDigest: false } });
    if (updated.count === 0) throw new GoneException(INVALID_LINK);
  }
}
