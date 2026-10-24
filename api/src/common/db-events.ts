import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import { Observable, Subject, endWith, filter, ignoreElements, map } from 'rxjs';
import type { Env } from '../config/env.js';
import { isoDay } from './clock.js';
import { errorMessage } from './errors.js';
import { isRecord } from './json.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface ChatMessageEvent {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ChatClosedEvent {
  matchId: string;
  closed: true;
}

export type ChatEvent = ChatMessageEvent | ChatClosedEvent;

export interface MatchesReadyEvent {
  day: string;
}

interface Events {
  chat_messages: ChatEvent;
  matches_ready: MatchesReadyEvent;
}

type Channel = keyof Events;

const RECONNECT_MS = 1000;

interface Notification {
  channel: string;
  payload: string;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isIsoDay(value: string): boolean {
  const time = Date.parse(value);
  return !Number.isNaN(time) && isoDay(new Date(time)) === value;
}

function readChatEvent(value: unknown): ChatEvent | undefined {
  if (!isRecord(value)) return undefined;
  const { id, matchId, senderId, body, createdAt, closed } = value;
  if (typeof matchId !== 'string') return undefined;
  if (closed === true) return { matchId, closed };
  if (typeof id !== 'string' || typeof senderId !== 'string' || typeof body !== 'string') return undefined;
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return undefined;
  return { id, matchId, senderId, body, createdAt };
}

function readMatchesReady(value: unknown): MatchesReadyEvent | undefined {
  if (!isRecord(value) || typeof value.day !== 'string' || !isIsoDay(value.day)) return undefined;
  return { day: value.day };
}

const readers: { [C in Channel]: (value: unknown) => Events[C] | undefined } = {
  chat_messages: readChatEvent,
  matches_ready: readMatchesReady,
};

export function isClosed(event: ChatEvent): event is ChatClosedEvent {
  return 'closed' in event;
}

export function publish<C extends Channel>(db: Prisma.TransactionClient, channel: C, ...events: Events[C][]) {
  const payloads = events.map((event) => JSON.stringify(event));
  return db.$executeRaw`SELECT pg_notify(${channel}, payload) FROM unnest(${payloads}::text[]) AS payload`;
}

@Injectable()
export class DbEvents implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DbEvents.name);
  private readonly events = new Subject<Notification>();
  private readonly connected = new Subject<void>();
  private client?: pg.Client;
  private closing = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly config: ConfigService<Env, true>) {}

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

  on<C extends Channel>(channel: C): Observable<Events[C]> {
    const read = readers[channel];
    return this.events.pipe(
      filter((notification) => notification.channel === channel),
      map((notification) => {
        const event = read(parseJson(notification.payload));
        if (!event) this.log.warn(`Ignoring malformed ${channel} notification`);
        return event;
      }),
      filter((event): event is Events[C] => event !== undefined),
    );
  }

  get reconnected(): Observable<void> {
    return this.connected.asObservable();
  }

  get stopped(): Observable<void> {
    return this.events.pipe(ignoreElements(), endWith(undefined));
  }

  private async connect() {
    const client = new pg.Client({ connectionString: this.config.get('DATABASE_URL', { infer: true }) });
    client.on('notification', (message) => {
      if (message.payload) this.events.next({ channel: message.channel, payload: message.payload });
    });
    client.on('error', (error) => {
      this.log.warn(`Listener lost its connection: ${error.message}`);
      this.scheduleReconnect(client);
    });
    client.on('end', () => this.scheduleReconnect(client));

    await client.connect();
    for (const channel of Object.keys(readers)) await client.query(`LISTEN ${channel}`);
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
        .catch((error: unknown) => {
          this.log.warn(`Listener reconnect failed: ${errorMessage(error)}`);
          this.retryLater();
        });
    }, RECONNECT_MS);
  }
}
