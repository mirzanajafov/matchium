import { Clock } from '../../src/common/clock.js';
import { type Mail, Mailer } from '../../src/mail/mailer.js';
import { PhotoStore } from '../../src/photos/photo-store.js';
import { type Delivery, type PushMessage, PushSender, type PushTarget } from '../../src/push/push-sender.js';

export class FakePushSender extends PushSender {
  readonly publicKey = 'test-public-key';
  sent: { endpoint: string; message: PushMessage }[] = [];
  gone = new Set<string>();

  send(target: PushTarget, message: PushMessage): Promise<Delivery> {
    if (this.gone.has(target.endpoint)) return Promise.resolve('gone');
    this.sent.push({ endpoint: target.endpoint, message });
    return Promise.resolve('sent');
  }
}

export class FixedClock extends Clock {
  current = new Date('2026-09-23T09:00:00Z');

  now() {
    return new Date(this.current);
  }

  nextDay() {
    this.current = new Date(this.current.getTime() + 24 * 60 * 60 * 1000);
  }
}

export class FakePhotoStore extends PhotoStore {
  readonly enabled = true;
  objects = new Map<string, Buffer>();
  refuseDeletes = false;

  put(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, body);
    return Promise.resolve();
  }

  get(key: string): Promise<Buffer> {
    const body = this.objects.get(key);
    return body ? Promise.resolve(body) : Promise.reject(new Error('missing'));
  }

  delete(keys: string[]): Promise<void> {
    if (this.refuseDeletes) return Promise.reject(new Error('Access denied'));
    for (const key of keys) this.objects.delete(key);
    return Promise.resolve();
  }
}

export class FakeMailer extends Mailer {
  enabled = true;
  sent: Mail[] = [];
  server: 'up' | 'stalled' | 'down' = 'up';

  send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    if (this.server === 'stalled') return new Promise(() => undefined);
    return this.server === 'down' ? Promise.reject(new Error('Connection refused')) : Promise.resolve();
  }
}
