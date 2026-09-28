import { digestEmail } from './digest-email.js';

const base = {
  name: 'Alice <3',
  webUrl: 'http://localhost:3101',
  unsubscribeUrl: 'http://localhost:3101/unsubscribe?token=abc',
};

describe('digestEmail', () => {
  it('leads with new matches and links to today', () => {
    const mail = digestEmail({ ...base, newMatches: 3, unreadChats: 1 });
    expect(mail.subject).toBe('3 new matches today');
    expect(mail.text).toContain('You have 3 new matches today.');
    expect(mail.text).toContain('1 chat has unread messages.');
    expect(mail.text).toContain('Open Matchium: http://localhost:3101/today');
    expect(mail.text).toContain(base.unsubscribeUrl);
  });

  it('falls back to chats when there are no new matches', () => {
    const mail = digestEmail({ ...base, newMatches: 0, unreadChats: 2 });
    expect(mail.subject).toBe('2 chats are waiting for you');
    expect(mail.text).not.toContain('new match');
    expect(mail.html).toContain('href="http://localhost:3101/chats"');
  });

  it('escapes names in the html part', () => {
    const mail = digestEmail({ ...base, newMatches: 1, unreadChats: 0 });
    expect(mail.subject).toBe('1 new match today');
    expect(mail.html).toContain('Hi Alice &#60;3,');
    expect(mail.html).not.toContain('Alice <3');
  });
});
