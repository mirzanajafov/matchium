import type { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { WebPushSender } from './push-sender.js';

const keys = webpush.generateVAPIDKeys();
const target = { endpoint: 'https://push.example.com/abc', p256dh: 'p', auth: 'a' };
const message = { title: 'Hi', body: 'There', url: '/today', tag: 'matches' };

function sender(values: Record<string, string>) {
  return new WebPushSender({ get: (key: string) => values[key] } as unknown as ConfigService);
}

describe('WebPushSender', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays disabled without a key pair', async () => {
    const disabled = sender({ VAPID_PUBLIC_KEY: keys.publicKey });
    expect(disabled.publicKey).toBeNull();
    await expect(disabled.send(target, message)).rejects.toThrow(/not configured/);
  });

  it('signs with the configured keys and reports expired subscriptions', async () => {
    const send = vi.spyOn(webpush, 'sendNotification');
    const configured = sender({
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: 'mailto:push@example.com',
    });
    expect(configured.publicKey).toBe(keys.publicKey);

    send.mockResolvedValueOnce({ statusCode: 201, body: '', headers: {} });
    await expect(configured.send(target, message)).resolves.toBe('sent');
    expect(send).toHaveBeenCalledWith(
      { endpoint: target.endpoint, keys: { p256dh: 'p', auth: 'a' } },
      JSON.stringify(message),
      expect.objectContaining({ vapidDetails: expect.objectContaining({ publicKey: keys.publicKey }) }),
    );

    send.mockRejectedValueOnce(new webpush.WebPushError('Gone', 410, {}, '', target.endpoint));
    await expect(configured.send(target, message)).resolves.toBe('gone');

    send.mockRejectedValueOnce(new webpush.WebPushError('Server error', 500, {}, '', target.endpoint));
    await expect(configured.send(target, message)).rejects.toThrow('Server error');
  });
});
