import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ChatsService } from '../chats/chats.service.js';
import { emailsSent } from '../observability/metrics.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { digestEmail } from './digest-email.js';
import { Mailer } from './mailer.js';

const UNSUBSCRIBE_PURPOSE = 'unsubscribe';

@Injectable()
export class DigestService {
  private readonly log = new Logger(DigestService.name);
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly jwt: JwtService,
    private readonly chats: ChatsService,
    config: ConfigService,
  ) {
    this.webUrl = (config.get<string>('WEB_URL') ?? 'http://localhost:3101').replace(/\/$/, '');
  }

  async send(userId: string, newMatches: number): Promise<boolean> {
    if (!this.mailer.enabled) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, emailDigest: true, emailVerifiedAt: true, bannedAt: true },
    });
    if (!user?.emailDigest || !user.emailVerifiedAt || user.bannedAt) return false;

    const unreadChats = await this.chats.unreadCount(userId);
    if (newMatches === 0 && unreadChats === 0) return false;

    const token = this.jwt.sign({ sub: userId, purpose: UNSUBSCRIBE_PURPOSE }, { expiresIn: '365d' });
    const unsubscribeUrl = `${this.webUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
    const oneClickUrl = `${this.webUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
    const mail = digestEmail({ name: user.displayName, newMatches, unreadChats, webUrl: this.webUrl, unsubscribeUrl });
    try {
      await this.mailer.send({
        to: user.email,
        ...mail,
        headers: { 'List-Unsubscribe': `<${oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      emailsSent.inc({ kind: 'digest', result: 'sent' });
      return true;
    } catch (error) {
      emailsSent.inc({ kind: 'digest', result: 'failed' });
      this.log.warn(`Digest to ${userId} failed: ${(error as Error).message}`);
      return false;
    }
  }

  async unsubscribe(token: string): Promise<boolean> {
    let userId: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; purpose?: string }>(token);
      if (payload.purpose !== UNSUBSCRIBE_PURPOSE) return false;
      userId = payload.sub;
    } catch {
      return false;
    }
    const updated = await this.prisma.user.updateMany({ where: { id: userId }, data: { emailDigest: false } });
    return updated.count > 0;
  }
}
