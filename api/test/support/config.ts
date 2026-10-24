import { ConfigService } from '@nestjs/config';
import { type Env, validateEnv } from '../../src/config/env.js';

export function testConfig(settings: Record<string, string> = {}): ConfigService<Env, true> {
  const env = validateEnv({ DATABASE_URL: 'postgresql://localhost/db', JWT_SECRET: 'long-enough-secret', ...settings });
  return new ConfigService<Env, true>(env);
}
