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

  it('reads TRUST_PROXY as off, a number of hops or the list Express parses', () => {
    const trustProxy = (value: string) => validateEnv({ ...base, TRUST_PROXY: value }).TRUST_PROXY;
    expect(validateEnv(base).TRUST_PROXY).toBe('loopback');
    expect(trustProxy('false')).toBe(false);
    expect(trustProxy(' 2 ')).toBe(2);
    expect(trustProxy('loopback, uniquelocal')).toBe('loopback, uniquelocal');
  });

  it('reads LOG_JSON as true or false and refuses anything else', () => {
    expect(validateEnv(base).LOG_JSON).toBe(false);
    expect(validateEnv({ ...base, LOG_JSON: 'true' }).LOG_JSON).toBe(true);
    expect(validateEnv({ ...base, LOG_JSON: 'false' }).LOG_JSON).toBe(false);
    expect(() => validateEnv({ ...base, LOG_JSON: 'yes' })).toThrow(/LOG_JSON/);
  });

  it('drops trailing slashes from WEB_URL so links never get a double slash', () => {
    expect(validateEnv({ ...base, WEB_URL: 'https://matchium.example//' }).WEB_URL).toBe('https://matchium.example');
  });
});
