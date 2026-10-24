import type { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { SmtpMailer } from './mailer.js';

const config = { get: (key: string) => (key === 'SMTP_URL' ? 'smtp://mail.example.com' : undefined) };
const mail = { to: 'alice@example.com', subject: 'Hi', text: 'Hi', html: '<p>Hi</p>' };

describe('SmtpMailer', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lets an email that is still being sent finish before it shuts down', async () => {
    vi.useFakeTimers();
    const transport = { sendMail: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 1000))), close: vi.fn() };
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport as unknown as Transporter);
    const mailer = new SmtpMailer(config as unknown as ConfigService);

    const sent = mailer.send(mail);
    const shutdown = mailer.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(999);
    expect(transport.close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([sent, shutdown]);
    expect(transport.close).toHaveBeenCalledOnce();
  });
});
