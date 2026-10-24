import { http, useTestApp } from './support/app.js';
import { as, matchedPair } from './support/builders.js';

useTestApp();

describe('metrics', () => {
  const scrape = async () =>
    (await http().get('/metrics').set('Authorization', 'Bearer test-metrics-token').expect(200)).text;

  it('stays hidden without the token', async () => {
    await http().get('/metrics').expect(404);
    await http().get('/metrics').set('Authorization', 'Bearer wrong').expect(404);
  });

  it('labels requests by route template, not by id, and counts refusals', async () => {
    const { alice, match } = await matchedPair();
    await http().get(`/chats/${match.id}/messages`).set(as(alice.token)).expect(403);
    for (let i = 0; i < 11; i += 1) {
      await http().post('/auth/login').send({ email: alice.email, password: 'wrong password' });
    }

    const text = await scrape();
    expect(text).toMatch(
      /matchium_http_requests_total\{method="GET",route="\/chats\/:id\/messages",status="403"\} \d+/,
    );
    expect(text).not.toContain(match.id);
    expect(text).toMatch(/matchium_rate_limited_total\{rule="login"\} [1-9]/);
    expect(text).toContain('matchium_chat_streams_open');
    expect(text).toContain('process_cpu_user_seconds_total');
  });
});
