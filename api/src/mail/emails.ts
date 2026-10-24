interface Link {
  label: string;
  url: string;
}

interface Email {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

interface Footer {
  text: string;
  link?: Link;
}

function layout(name: string, paragraphs: string[], action: Link, footer: Footer): string {
  const link = footer.link
    ? ` <a href="${escapeHtml(footer.link.url)}" style="color:#6b6f68">${escapeHtml(footer.link.label)}</a>.`
    : '';
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#1d1f1c;max-width:480px;margin:0 auto;padding:24px">
<p>Hi ${escapeHtml(name)},</p>
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
<p><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#1d1f1c;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="color:#6b6f68;font-size:12px">${escapeHtml(footer.text)}${link}</p>
</body></html>`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function verificationEmail(name: string, url: string): Email {
  const footer = "If you didn't sign up for Matchium, ignore this email and nothing happens.";
  return {
    subject: 'Confirm your email for Matchium',
    text: `Hi ${name},\n\nConfirm this is your email so we can send you match updates: ${url}\n\n${footer}`,
    html: layout(
      name,
      ['Confirm this is your email so we can send you match updates.'],
      { label: 'Confirm email', url },
      { text: footer },
    ),
  };
}

export function passwordResetEmail(name: string, url: string): Email {
  const footer = "If you didn't ask for this, ignore it. Your password stays the same.";
  return {
    subject: 'Reset your Matchium password',
    text: `Hi ${name},\n\nSet a new password here (the link works for 30 minutes, once): ${url}\n\n${footer}`,
    html: layout(
      name,
      ['Set a new password with the button below. The link works for 30 minutes, once.'],
      { label: 'Choose a new password', url },
      { text: footer },
    ),
  };
}

export function signupEmail(url: string, days: number): Email {
  const footer = "If you didn't sign up for Matchium, ignore this email. No account is made without the password.";
  return {
    subject: 'Finish signing up for Matchium',
    text: `Hi there,\n\nTo finish signing up, open this link and enter the password you chose (it works for ${days} days): ${url}\n\n${footer}`,
    html: layout(
      'there',
      [`To finish signing up, open the link and enter the password you chose. It works for ${days} days.`],
      { label: 'Finish signing up', url },
      { text: footer },
    ),
  };
}

export function accountExistsEmail(name: string, webUrl: string): Email {
  const footer = "If this wasn't you, ignore this email. Nothing about your account changed.";
  const login = `${webUrl}/login`;
  return {
    subject: 'You already have a Matchium account',
    text: `Hi ${name},\n\nSomeone just tried to sign up for Matchium with this address, and it already has an account. If it was you, log in here: ${login}\nForgot your password? Reset it here: ${webUrl}/forgot-password\n\n${footer}`,
    html: layout(
      name,
      [
        'Someone just tried to sign up for Matchium with this address, and it already has an account. If it was you, log in instead. You can reset a forgotten password from the login page.',
      ],
      { label: 'Log in', url: login },
      { text: footer },
    ),
  };
}

export interface DigestContent {
  name: string;
  newMatches: number;
  unreadChats: number;
  webUrl: string;
  unsubscribeUrl: string;
}

export function digestEmail(content: DigestContent): Email {
  const lines = [
    content.newMatches > 0 && `You have ${plural(content.newMatches, 'new match', 'new matches')} today.`,
    content.unreadChats > 0 && `${plural(content.unreadChats, 'chat has', 'chats have')} unread messages.`,
  ].filter((line): line is string => Boolean(line));
  const target = content.newMatches > 0 ? `${content.webUrl}/today` : `${content.webUrl}/chats`;
  const footer = "You get this because you haven't turned on push notifications.";
  const subject =
    content.newMatches > 0
      ? plural(content.newMatches, 'new match today', 'new matches today')
      : plural(content.unreadChats, 'chat is waiting for you', 'chats are waiting for you');

  return {
    subject,
    text: [
      `Hi ${content.name},`,
      '',
      ...lines,
      '',
      `Open Matchium: ${target}`,
      '',
      `${footer} Stop these emails: ${content.unsubscribeUrl}`,
    ].join('\n'),
    html: layout(
      content.name,
      lines,
      { label: 'Open Matchium', url: target },
      {
        text: footer,
        link: { label: 'Stop these emails', url: content.unsubscribeUrl },
      },
    ),
  };
}
