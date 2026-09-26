import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export type Delivery = 'sent' | 'gone';

const TTL_SECONDS = 12 * 60 * 60;

export abstract class PushSender {
  abstract readonly publicKey: string | null;
  abstract send(target: PushTarget, message: PushMessage): Promise<Delivery>;
}

@Injectable()
export class WebPushSender extends PushSender {
  readonly publicKey: string | null;
  private readonly details?: { subject: string; publicKey: string; privateKey: string };

  constructor(config: ConfigService) {
    super();
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY') ?? '';
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY') ?? '';
    const subject = config.get<string>('VAPID_SUBJECT') ?? '';
    this.publicKey = publicKey && privateKey ? publicKey : null;
    if (this.publicKey) this.details = { subject, publicKey, privateKey };
  }

  async send(target: PushTarget, message: PushMessage): Promise<Delivery> {
    if (!this.details) throw new Error('Web push is not configured');
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        { TTL: TTL_SECONDS, vapidDetails: this.details },
      );
      return 'sent';
    } catch (error) {
      if (error instanceof webpush.WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return 'gone';
      throw error;
    }
  }
}
