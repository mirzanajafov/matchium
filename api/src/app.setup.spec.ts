import { Controller, Get, Ip } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from './app.setup.js';
import { validateEnv } from './config/env.js';

@Controller()
class ClientController {
  @Get()
  client(@Ip() ip: string) {
    return { ip };
  }
}

async function clientSeen(trustProxy: string, forwardedFor: string): Promise<unknown> {
  const env = validateEnv({
    DATABASE_URL: 'postgresql://localhost/db',
    JWT_SECRET: 'long-enough-secret',
    TRUST_PROXY: trustProxy,
  });
  const moduleRef = await Test.createTestingModule({
    controllers: [ClientController],
    providers: [{ provide: ConfigService, useValue: new ConfigService(env) }],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  try {
    const response = await request(app.getHttpServer()).get('/').set('X-Forwarded-For', forwardedFor).expect(200);
    return response.body;
  } finally {
    await app.close();
  }
}

describe('trust proxy', () => {
  const chain = '203.0.113.7, 10.0.0.2';

  it('trusts every address in a list written with spaces', async () => {
    expect(await clientSeen('loopback, uniquelocal', chain)).toEqual({ ip: '203.0.113.7' });
  });

  it('reads a number as a count of hops, not as an address', async () => {
    expect(await clientSeen('1', chain)).toEqual({ ip: '10.0.0.2' });
    expect(await clientSeen('2', chain)).toEqual({ ip: '203.0.113.7' });
  });

  it('ignores the header when turned off', async () => {
    expect(await clientSeen('false', chain)).toEqual({ ip: expect.stringMatching(/127\.0\.0\.1$/) });
  });
});
