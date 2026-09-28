function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function layout(name: string, paragraphs: string[], action: { label: string; url: string }, footer: string): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#1d1f1c;max-width:480px;margin:0 auto;padding:24px">
<p>Hi ${escapeHtml(name)},</p>
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
<p><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#1d1f1c;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="color:#6b6f68;font-size:12px">${escapeHtml(footer)}</p>
</body></html>`;
}

export function verificationEmail(name: string, url: string) {
  const footer = "If you didn't sign up for Matchium, ignore this email and nothing happens.";
  return {
    subject: 'Confirm your email for Matchium',
    text: `Hi ${name},\n\nConfirm this is your email so we can send you match updates: ${url}\n\n${footer}`,
    html: layout(name, ['Confirm this is your email so we can send you match updates.'], { label: 'Confirm email', url }, footer),
  };
}

export function passwordResetEmail(name: string, url: string) {
  const footer = "If you didn't ask for this, ignore it. Your password stays the same.";
  return {
    subject: 'Reset your Matchium password',
    text: `Hi ${name},\n\nSet a new password here (the link works for 30 minutes, once): ${url}\n\n${footer}`,
    html: layout(
      name,
      ['Set a new password with the button below. The link works for 30 minutes, once.'],
      { label: 'Choose a new password', url },
      footer,
    ),
  };
}
