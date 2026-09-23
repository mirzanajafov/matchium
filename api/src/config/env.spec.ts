import { validateEnv } from './env.js';

const base = { DATABASE_URL: 'postgresql://localhost/db', JWT_SECRET: 'long-enough-secret' };

describe('validateEnv', () => {
  it('converts numeric strings and applies defaults', () => {
    expect(validateEnv({ ...base, PORT: '3100' })).toMatchObject({ PORT: 3100, QUESTIONS_PER_DAY: 6 });
    expect(validateEnv(base)).toMatchObject({ PORT: 3000 });
  });

  it('rejects missing or invalid values', () => {
    expect(() => validateEnv({ DATABASE_URL: 'x' })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...base, QUESTIONS_PER_DAY: '50' })).toThrow(/QUESTIONS_PER_DAY/);
  });
});
