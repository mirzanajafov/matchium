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
    return ip;
  }
}

async function clientAddress(trustProxy: string, forwardedFor: string): Promise<string> {
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
    return response.text;
  } finally {
    await app.close();
  }
}

describe('trust proxy', () => {
  const chain = '203.0.113.7, 10.0.0.2';

  it('trusts every proxy in a list written with spaces', async () => {
    expect(await clientAddress('loopback, uniquelocal', chain)).toBe('203.0.113.7');
  });

  it('trusts a number as that many hops, not as an address', async () => {
    expect(await clientAddress('1', chain)).toBe('10.0.0.2');
  });

  it('ignores the header when turned off', async () => {
    expect(await clientAddress('false', chain)).toMatch(/127\.0\.0\.1$/);
  });
});
