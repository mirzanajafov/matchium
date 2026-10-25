import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { appOptions, configureApp } from '../../src/app.setup.js';
import { Clock } from '../../src/common/clock.js';
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

export function waitForLockWaits(count: number) {
  return vi.waitFor(
    async () => {
      const [waiting] = await prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = current_database()`;
      expect(waiting?.count).toBe(count);
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
