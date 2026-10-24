import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export abstract class Mailer {
  abstract readonly enabled: boolean;
  abstract send(mail: Mail): Promise<void>;
}

@Injectable()
export class SmtpMailer extends Mailer implements OnApplicationShutdown {
  readonly enabled: boolean;
  private readonly transport?: Transporter;
  private readonly from: string;
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(config: ConfigService) {
    super();
    const url = config.get<string>('SMTP_URL') ?? '';
    this.from = config.get<string>('MAIL_FROM') ?? 'Matchium <hello@matchium.local>';
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
