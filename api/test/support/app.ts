import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { appOptions, configureApp } from '../../src/app.setup.js';
import { Clock } from '../../src/common/clock.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { Mailer } from '../../src/mail/mailer.js';
import { PhotoStore } from '../../src/photos/photo-store.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { PushSender } from '../../src/push/push-sender.js';
import { FakeMailer, FakePhotoStore, FakePushSender, FixedClock, START } from './fakes.js';

export let app: INestApplication;
export let prisma: PrismaService;
export const clock = new FixedClock();
export const pushes = new FakePushSender();
export const mails = new FakeMailer();
export const photos = new FakePhotoStore();

export async function startApp({ mailer = mails, store = photos }: { mailer?: Mailer; store?: PhotoStore } = {}) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(PushSender)
    .useValue(pushes)
    .overrideProvider(Mailer)
    .useValue(mailer)
    .overrideProvider(PhotoStore)
    .useValue(store)
    .compile();
  const started = configureApp(moduleRef.createNestApplication(appOptions));
  await started.listen(0, '127.0.0.1');
  return started;
}

export function http() {
  return request(app.getHttpServer());
}

export function waitUntilBlocking(tx: Prisma.TransactionClient) {
  return vi.waitFor(
    async () => {
      const [blocked] = await tx.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM (SELECT DISTINCT pid FROM pg_locks WHERE NOT granted) waiting
        WHERE pg_blocking_pids(pid) @> ARRAY[pg_backend_pid()]`;
      expect(blocked?.count).toBe(1);
    },
    { timeout: 3000 },
  );
}

function truncate() {
  return prisma.$executeRawUnsafe('TRUNCATE "User", "RateLimit", "PendingSignup" CASCADE');
}

export function useTestApp() {
  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncate();
    clock.current = START;
    pushes.sent = [];
    pushes.gone.clear();
    mails.sent = [];
    mails.server = 'up';
    mails.enabled = true;
    photos.objects.clear();
    photos.refuseDeletes = false;
  });

  afterAll(async () => {
    await truncate();
    await app.close();
  });
}
