import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';
import { emailsSent } from '../observability/metrics.js';

export type EmailKind = 'signup' | 'account-exists' | 'verify' | 'reset' | 'digest';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export abstract class Mailer {
  private readonly log = new Logger(Mailer.name);
  abstract readonly enabled: boolean;
  abstract send(mail: Mail): Promise<void>;

  async deliver(kind: EmailKind, mail: Mail): Promise<void> {
    try {
      await this.send(mail);
      emailsSent.inc({ kind, result: 'sent' });
    } catch (error) {
      emailsSent.inc({ kind, result: 'failed' });
      this.log.warn(`Sending the ${kind} email failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

@Injectable()
export class SmtpMailer extends Mailer implements OnApplicationShutdown {
  readonly enabled: boolean;
  private readonly transport?: Transporter;
  private readonly from: string;
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(config: ConfigService<Env, true>) {
    super();
    const url = config.get('SMTP_URL', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true });
    this.enabled = url.length > 0;
    if (this.enabled) this.transport = nodemailer.createTransport(url);
  }

  async send(mail: Mail): Promise<void> {
    if (!this.transport) throw new Error('Email is not configured');
    const delivery = this.transport.sendMail({ from: this.from, ...mail });
    this.inFlight.add(delivery);
    try {
      await delivery;
    } finally {
      this.inFlight.delete(delivery);
    }
  }

  async onApplicationShutdown() {
    await Promise.allSettled(this.inFlight);
    this.transport?.close();
  }
}
