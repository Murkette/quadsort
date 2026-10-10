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

function resetEmail({ name, link }) {
  const text = `Hi ${name},\n\nSomeone asked to reset your Quadsort password. If that was you, use this link within an hour:\n\n${link}\n\nIf it wasn't you, ignore this. Nothing changes until the link is used.\n\nSort yourself out,\nQuadsort`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#17142A">
  <h1 style="font-size:28px;margin:0 0 16px">Reset your password</h1>
  <p>Hi ${esc(name)}, someone asked to reset your Quadsort password. If that was you, this link works for an hour:</p>
  <p><a href="${esc(link)}" style="display:inline-block;padding:14px 26px;border:2px solid #17142A;border-radius:999px;background:#FFD84D;color:#17142A;font-weight:700;text-decoration:none">Choose a new password</a></p>
  <p style="color:#5B5770;font-size:14px">If it wasn't you, ignore this. Nothing changes until the link is used.</p></div>`;
  return { subject: 'Reset your Quadsort password', text, html };
}

module.exports = { send, resetEmail };
