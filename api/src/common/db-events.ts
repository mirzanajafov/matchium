import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import { Observable, Subject, filter, map } from 'rxjs';

export const CHAT_CHANNEL = 'chat_messages';
export const MATCHES_CHANNEL = 'matches_ready';
const CHANNELS = [CHAT_CHANNEL, MATCHES_CHANNEL];
const RECONNECT_MS = 1000;

interface Notification {
  channel: string;
  payload: string;
}

@Injectable()
export class DbEvents implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DbEvents.name);
  private readonly events = new Subject<Notification>();
  private readonly connected = new Subject<void>();
  private client?: pg.Client;
  private closing = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.closing = true;
    clearTimeout(this.reconnectTimer);
    this.events.complete();
    this.connected.complete();
    await this.client?.end().catch(() => undefined);
  }

  on<T>(channel: string): Observable<T> {
    return this.events.pipe(
      filter((event) => event.channel === channel),
      map((event): T | undefined => {
        try {
          return JSON.parse(event.payload) as T;
        } catch {
          this.log.warn(`Ignoring malformed ${channel} notification`);
          return undefined;
        }
      }),
      filter((value): value is T => value !== undefined),
    );
  }

  get reconnected(): Observable<void> {
    return this.connected.asObservable();
  }

  private async connect() {
    const client = new pg.Client({ connectionString: this.config.getOrThrow<string>('DATABASE_URL') });
    client.on('notification', (message) => {
      if (message.payload) this.events.next({ channel: message.channel, payload: message.payload });
    });
    client.on('error', (error) => {
      this.log.warn(`Listener lost its connection: ${error.message}`);
      this.scheduleReconnect(client);
    });
    client.on('end', () => this.scheduleReconnect(client));

    await client.connect();
    for (const channel of CHANNELS) await client.query(`LISTEN ${channel}`);
    this.client = client;
  }

  private scheduleReconnect(dead: pg.Client) {
    if (this.client !== dead) return;
    this.client = undefined;
    dead.end().catch(() => undefined);
    this.retryLater();
  }

  private retryLater() {
    if (this.closing || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect()
        .then(() => {
          this.log.log('Listener reconnected');
          this.connected.next();
        })
        .catch((error: Error) => {
          this.log.warn(`Listener reconnect failed: ${error.message}`);
          this.retryLater();
        });
    }, RECONNECT_MS);
  }
}
