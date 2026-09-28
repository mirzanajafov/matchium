export interface DigestContent {
  name: string;
  newMatches: number;
  unreadChats: number;
  webUrl: string;
  unsubscribeUrl: string;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function digestSubject(content: DigestContent): string {
  if (content.newMatches > 0) return plural(content.newMatches, 'new match today', 'new matches today');
  return plural(content.unreadChats, 'chat is waiting for you', 'chats are waiting for you');
}

export function digestEmail(content: DigestContent) {
  const lines = [
    content.newMatches > 0 && `You have ${plural(content.newMatches, 'new match', 'new matches')} today.`,
    content.unreadChats > 0 && `${plural(content.unreadChats, 'chat has', 'chats have')} unread messages.`,
  ].filter((line): line is string => Boolean(line));
  const target = content.newMatches > 0 ? `${content.webUrl}/today` : `${content.webUrl}/chats`;

  const text = [
    `Hi ${content.name},`,
    '',
    ...lines,
    '',
    `Open Matchium: ${target}`,
    '',
    `You get this because you haven't turned on push notifications. Stop these emails: ${content.unsubscribeUrl}`,
  ].join('\n');

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#1d1f1c;max-width:480px;margin:0 auto;padding:24px">
<p>Hi ${escapeHtml(content.name)},</p>
${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n')}
<p><a href="${escapeHtml(target)}" style="display:inline-block;background:#1d1f1c;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Open Matchium</a></p>
<p style="color:#6b6f68;font-size:12px">You get this because you haven't turned on push notifications.
<a href="${escapeHtml(content.unsubscribeUrl)}" style="color:#6b6f68">Stop these emails</a>.</p>
</body></html>`;

  return { subject: digestSubject(content), text, html };
}
