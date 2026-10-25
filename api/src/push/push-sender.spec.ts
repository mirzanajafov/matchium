import webpush from 'web-push';
import { testConfig } from '../../test/support/config.js';
import { WebPushSender } from './push-sender.js';

const keys = webpush.generateVAPIDKeys();
const target = { endpoint: 'https://push.example.com/abc', p256dh: 'p', auth: 'a' };
const message = { title: 'Hi', body: 'There', url: '/today', tag: 'matches' };

describe('WebPushSender', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays disabled without a key pair', async () => {
    const disabled = new WebPushSender(testConfig({ VAPID_PUBLIC_KEY: keys.publicKey }));
    expect(disabled.publicKey).toBeNull();
    await expect(disabled.send(target, message)).rejects.toThrow(/not configured/);
  });

  it('signs with the configured keys, gives up on a silent push service and reports expired subscriptions', async () => {
    const send = vi.spyOn(webpush, 'sendNotification');
    const configured = new WebPushSender(
      testConfig({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey }),
    );
    expect(configured.publicKey).toBe(keys.publicKey);

    send.mockResolvedValueOnce({ statusCode: 201, body: '', headers: {} });
    await expect(configured.send(target, message)).resolves.toBe('sent');
    expect(send).toHaveBeenCalledWith(
      { endpoint: target.endpoint, keys: { p256dh: 'p', auth: 'a' } },
      JSON.stringify(message),
      expect.objectContaining({
        timeout: 10_000,
        vapidDetails: expect.objectContaining({ publicKey: keys.publicKey }),
      }),
    );

    send.mockRejectedValueOnce(new webpush.WebPushError('Gone', 410, {}, '', target.endpoint));
    await expect(configured.send(target, message)).resolves.toBe('gone');

    send.mockRejectedValueOnce(new webpush.WebPushError('Server error', 500, {}, '', target.endpoint));
    await expect(configured.send(target, message)).rejects.toThrow('Server error');
  });
});
