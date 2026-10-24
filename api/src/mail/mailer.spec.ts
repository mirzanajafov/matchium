import nodemailer from 'nodemailer';
import { testConfig } from '../../test/support/config.js';
import { emailsSent } from '../observability/metrics.js';
import { Mailer, SmtpMailer } from './mailer.js';

class ScriptedMailer extends Mailer {
  readonly enabled = true;

  constructor(private readonly outcome: 'up' | 'down') {
    super();
  }

  send(): Promise<void> {
    return this.outcome === 'up' ? Promise.resolve() : Promise.reject(new Error('Connection refused'));
  }
}

const mail = { to: 'alice@example.com', subject: 'Hi', text: 'Hi', html: '<p>Hi</p>' };

async function counted(kind: string, result: string): Promise<number> {
  const { values } = await emailsSent.get();
  return values.find((v) => v.labels.kind === kind && v.labels.result === result)?.value ?? 0;
}

describe('Mailer.deliver', () => {
  it('counts a sent email', async () => {
    const before = await counted('verify', 'sent');
    await new ScriptedMailer('up').deliver('verify', mail);
    expect(await counted('verify', 'sent')).toBe(before + 1);
  });

  it('counts a failed email instead of throwing, so a request never fails on mail', async () => {
    const before = await counted('reset', 'failed');
    await expect(new ScriptedMailer('down').deliver('reset', mail)).resolves.toBeUndefined();
    expect(await counted('reset', 'failed')).toBe(before + 1);
  });
});

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
    const mailer = new SmtpMailer(testConfig({ SMTP_URL: 'smtp://mail.example.com' }));

    await Promise.all([mailer.send(mail), mailer.onApplicationShutdown()]);
    expect(events).toEqual(['sent', 'closed']);
  });
});
