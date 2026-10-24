import { GoneException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PurposeTokens } from './purpose-tokens.js';

const jwt = new JwtService({ secret: 'long-enough-secret' });
const tokens = new PurposeTokens(jwt);

describe('PurposeTokens', () => {
  it('reads back the claims of a token signed for the same purpose', async () => {
    const token = tokens.sign('reset-password', { sub: 'user-1', stamp: 'abc' });
    await expect(tokens.read(token, 'reset-password')).resolves.toMatchObject({ sub: 'user-1', stamp: 'abc' });
  });

  it('refuses a token signed for another purpose as a dead link', async () => {
    const token = tokens.sign('reset-password', { sub: 'user-1', stamp: 'abc' });
    await expect(tokens.read(token, 'unsubscribe')).rejects.toThrow(GoneException);
  });

  it('refuses a session token, which carries no purpose', async () => {
    const session = jwt.sign({ sub: 'user-1', sid: 'session-1' });
    await expect(tokens.read(session, 'unsubscribe')).rejects.toThrow(GoneException);
  });

  it('refuses a token signed with another secret', async () => {
    const forged = new JwtService({ secret: 'someone-else' }).sign({ sub: 'user-1', purpose: 'unsubscribe' });
    await expect(tokens.read(forged, 'unsubscribe')).rejects.toThrow(GoneException);
  });
});
