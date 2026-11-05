// Email through Resend's HTTP API (no dependency). Configure with two environment variables:
//   RESEND_API_KEY   from resend.com
//   MAIL_FROM        e.g. "Quadsort <hello@quadsort.com>", needs quadsort.com verified in Resend.
//                    Until then Resend only lets "onboarding@resend.dev" send, and only to your own address.
const FROM_FALLBACK = 'Quadsort <onboarding@resend.dev>';

async function send({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') throw new Error('RESEND_API_KEY is not set');
    console.log(`[mail, not sent: no RESEND_API_KEY]\nto: ${to}\nsubject: ${subject}\n${text}\n`); // handy in development
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || FROM_FALLBACK, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Emails share one frame: a six-stripe band, white paper, black type, one ink button. Plain text always comes with it.
const RAINBOW = '#61BB46,#FDB827,#F5821F,#E03A3E,#963D97,#009DDC';
const frame = (heading, body, button, link, small) => `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:auto;color:#1A1A1A">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${RAINBOW.split(',').map((c) => `<tr><td height="1" style="background:${c};line-height:1px;font-size:1px">&nbsp;</td></tr>`).join('')}</table>
  <div style="padding:28px 24px">
    <h1 style="font-family:Garamond,'EB Garamond',Georgia,serif;font-weight:500;font-size:32px;line-height:1.1;margin:0 0 16px">${heading}</h1>
    <p style="font-size:16px;line-height:1.5;margin:0 0 20px">${body}</p>
    <p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#1A1A1A;color:#FFFFFF;font-weight:600;text-decoration:none">${button}</a></p>
    <p style="color:#5C5C5C;font-size:14px;line-height:1.5;margin:0">${small}</p>
  </div></div>`;

function resetEmail({ name, link }) {
  const text = `Hi ${name},\n\nSomeone asked to reset your Quadsort password. If that was you, use this link within an hour:\n\n${link}\n\nIf it wasn't you, ignore this. Nothing changes until the link is used.\n\nQuadsort`;
  const html = frame('Reset your password', `Hi ${esc(name)}, someone asked to reset your Quadsort password. If that was you, this link works for an hour.`,
    'Choose a new password', link, "If it wasn't you, ignore this. Nothing changes until the link is used.");
  return { subject: 'Reset your Quadsort password', text, html };
}

function dailyEmail({ name, title, number, label, link }) {
  const text = `Hi ${name},\n\n"${title}" is Quadsort Daily #${number} on ${label}. Everyone who plays that day gets your puzzle.\n\nHere it is:\n${link}\n\nShare that link. It is the same for everyone, and your name is on it.\n\nQuadsort`;
  const html = frame('Your puzzle is the Daily', `Hi ${esc(name)}, <b>${esc(title)}</b> is Quadsort Daily #${esc(number)} on ${esc(label)}. Everyone who plays that day gets your puzzle.`,
    'See your puzzle', link, 'Share that link. It is the same for everyone, and your name is on it.');
  return { subject: `Your puzzle is the Daily on ${label}`, text, html };
}

module.exports = { send, resetEmail, dailyEmail };
