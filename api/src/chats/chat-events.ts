import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import { Observable, Subject, filter } from 'rxjs';

export const CHAT_CHANNEL = 'chat_messages';
const RECONNECT_MS = 1000;

export interface ChatEvent {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

@Injectable()
export class ChatEvents implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ChatEvents.name);
  private readonly events = new Subject<ChatEvent>();
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
    await this.client?.end().catch(() => undefined);
  }

  forMatch(matchId: string): Observable<ChatEvent> {
    return this.events.pipe(filter((event) => event.matchId === matchId));
  }

  private async connect() {
    const client = new pg.Client({ connectionString: this.config.getOrThrow<string>('DATABASE_URL') });
    client.on('notification', (message) => {
      if (message.channel !== CHAT_CHANNEL || !message.payload) return;
      try {
        this.events.next(JSON.parse(message.payload) as ChatEvent);
      } catch {
        this.log.warn('Ignoring malformed chat notification');
      }
    });
    client.on('error', (error) => {
      this.log.warn(`Chat listener lost its connection: ${error.message}`);
      this.scheduleReconnect(client);
    });
    client.on('end', () => this.scheduleReconnect(client));

    await client.connect();
    await client.query(`LISTEN ${CHAT_CHANNEL}`);
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
        .then(() => this.log.log('Chat listener reconnected'))
        .catch((error: Error) => {
          this.log.warn(`Chat listener reconnect failed: ${error.message}`);
          this.retryLater();
        });
    }, RECONNECT_MS);
  }
}
