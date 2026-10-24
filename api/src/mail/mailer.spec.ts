import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { SmtpMailer } from './mailer.js';

describe('SmtpMailer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets an email that is still being sent finish before it shuts down', async () => {
    const events: string[] = [];
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const send = transport.transporter.send.bind(transport.transporter);
    vi.spyOn(transport.transporter, 'send').mockImplementation((message, done) => {
      setTimeout(() => {
        events.push('sent');
        send(message, done);
      }, 50);
    });
    vi.spyOn(transport, 'close').mockImplementation(() => events.push('closed'));
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport);
    const mailer = new SmtpMailer(new ConfigService({ SMTP_URL: 'smtp://mail.example.com' }));

    await Promise.all([
      mailer.send({ to: 'alice@example.com', subject: 'Hi', text: 'Hi', html: '<p>Hi</p>' }),
      mailer.onApplicationShutdown(),
    ]);
    expect(events).toEqual(['sent', 'closed']);
  });
});
