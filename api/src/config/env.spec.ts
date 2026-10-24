import { validateEnv } from './env.js';

const base = { DATABASE_URL: 'postgresql://localhost/db', JWT_SECRET: 'long-enough-secret' };

describe('validateEnv', () => {
  it('converts numeric strings and applies defaults', () => {
    expect(validateEnv({ ...base, PORT: '3100' })).toMatchObject({ PORT: 3100, QUESTIONS_PER_DAY: 6 });
    expect(validateEnv(base)).toMatchObject({ PORT: 3100 });
  });

  it('rejects missing or invalid values', () => {
    expect(() => validateEnv({ DATABASE_URL: 'x' })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...base, QUESTIONS_PER_DAY: '50' })).toThrow(/QUESTIONS_PER_DAY/);
    expect(() => validateEnv({ ...base, VAPID_SUBJECT: 'someone@example.com' })).toThrow(/VAPID_SUBJECT/);
  });

  it('reads TRUST_PROXY as off, a number of hops or a list of proxies', () => {
    const trustProxy = (value: string) => validateEnv({ ...base, TRUST_PROXY: value }).TRUST_PROXY;
    expect(validateEnv(base).TRUST_PROXY).toEqual(['loopback']);
    expect(trustProxy('False')).toBe(false);
    expect(trustProxy(' 2 ')).toBe(2);
    expect(trustProxy('loopback, 10.0.0.0/8 ,::1')).toEqual(['loopback', '10.0.0.0/8', '::1']);
  });

  it('refuses a TRUST_PROXY that would trust every client or names no proxy', () => {
    for (const value of ['true', 'lopback', 'loopback,', '10.0.0.0/eight', '']) {
      expect(() => validateEnv({ ...base, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
    }
  });
});
