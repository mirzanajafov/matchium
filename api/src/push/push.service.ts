import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type PushMessage, PushSender } from './push-sender.js';
import type { SubscriptionDto } from './dto/subscription.dto.js';

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: PushSender,
  ) {}

  get publicKey(): string | null {
    return this.sender.publicKey;
  }

  async subscribe(userId: string, dto: SubscriptionDto) {
    const keys = { p256dh: dto.keys.p256dh, auth: dto.keys.auth };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, ...keys },
      update: { userId, ...keys },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async notify(userId: string, message: PushMessage): Promise<number> {
    if (!this.sender.publicKey) return 0;
    const targets = await this.prisma.pushSubscription.findMany({ where: { userId } });
    const results = await Promise.allSettled(targets.map((target) => this.sender.send(target, message)));

    const gone = targets.filter((_, i) => {
      const result = results[i];
      return result?.status === 'fulfilled' && result.value === 'gone';
    });
    if (gone.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: gone.map((t) => t.id) } } });
    }
    for (const result of results) {
      if (result.status === 'rejected') this.log.warn(`Push delivery failed: ${String(result.reason)}`);
    }
    return results.filter((r) => r.status === 'fulfilled' && r.value === 'sent').length;
  }

  notifyInBackground(userId: string, message: PushMessage) {
    this.notify(userId, message).catch((error: Error) => this.log.warn(`Push failed: ${error.message}`));
  }
}
