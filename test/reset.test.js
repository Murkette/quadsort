const test = require('node:test');
const assert = require('node:assert');
const { serve } = require('./helpers');

// Stands in for Resend: records what would have been sent and never touches the network.
function resend(t, { status = 200, key = 're_test_key' } = {}) {
  const real = global.fetch, sent = [];
  const env = { key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM };
  if (key) process.env.RESEND_API_KEY = key; else delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  global.fetch = async (u, o) => {
    if (!String(u).startsWith('https://api.resend.com')) return real(u, o);
    sent.push({ url: String(u), headers: o.headers, body: JSON.parse(o.body) });
    return new Response(status === 200 ? '{"id":"abc"}' : 'rejected', { status });
  };
  t.after(() => {
    global.fetch = real;
    for (const [k, v] of [['RESEND_API_KEY', env.key], ['MAIL_FROM', env.from]]) v === undefined ? delete process.env[k] : (process.env[k] = v);
  });
  return sent;
}
const until = async (fn, ms = 1500) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 15)); } return false; };
const tokenIn = (mail) => /\/reset\/([\w-]+)/.exec(mail.body.text)[1];
const GENERIC = /If that email has an account, a reset link is on its way/;

test('forgot: the same answer whether or not the email has an account', async (t) => {
  const sent = resend(t);
  const { person, db } = await serve(t);
  await person().signup();
  const known = await (await person().form('/forgot', { email: 'P@x.com' })).text();
  const unknown = await (await person().form('/forgot', { email: 'nobody@x.com' })).text();
  const junk = await (await person().form('/forgot', { email: 'not an email' })).text();
  for (const html of [known, unknown, junk]) assert.match(html, GENERIC);
  assert.ok(await until(() => sent.length === 1));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(sent.length, 1, 'only the real account was emailed');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM password_resets').get().n, 1);
});

test('the email goes to Resend with the key, the right recipient and a working link', async (t) => {
  const sent = resend(t);
  const { person, url } = await serve(t);
  await person().signup();
  await person().form('/forgot', { email: 'p@x.com' });
  await until(() => sent.length);
  const [mail] = sent;
  assert.equal(mail.url, 'https://api.resend.com/emails');
  assert.equal(mail.headers.Authorization, 'Bearer re_test_key');
  assert.deepEqual(mail.body.to, ['p@x.com']);
  assert.equal(mail.body.from, 'Quadsort <onboarding@resend.dev>', 'falls back until MAIL_FROM is set');
  assert.equal(mail.body.subject, 'Reset your Quadsort password');
  assert.match(mail.body.text, new RegExp(`${url}/reset/[\\w-]{43}`));
  assert.match(mail.body.html, /Choose a new password/);
});

test('MAIL_FROM is used when set', async (t) => {
  const sent = resend(t);
  const { person } = await serve(t);
  await person().signup();
  process.env.MAIL_FROM = 'Quadsort <hello@quadsort.com>';
  t.after(() => delete process.env.MAIL_FROM);
  await person().form('/forgot', { email: 'p@x.com' });
  await until(() => sent.length);
  assert.equal(sent[0].body.from, 'Quadsort <hello@quadsort.com>');
});

test('at most one email a minute per account', async (t) => {
  const sent = resend(t);
  const { person } = await serve(t);
  await person().signup();
  for (let i = 0; i < 3; i++) await person().form('/forgot', { email: 'p@x.com' });
  await until(() => sent.length);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(sent.length, 1);
});

test('a reset link works once: sets the password, signs you in, signs everyone else out', async (t) => {
  const sent = resend(t);
  const { person, db } = await serve(t);
  const me = person(); await me.signup();            // a session that should be killed
  await person().form('/forgot', { email: 'p@x.com' });
  await until(() => sent.length);
  const token = tokenIn(sent[0]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM password_resets WHERE token_hash = ?').get(token).n, 0, 'the raw token is never stored');

  const fresh = person();
  assert.match(await (await fresh.get(`/reset/${token}`)).text(), /New password\./);
  const bad = await fresh.form(`/reset/${token}`, { password: 'short' });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /At least 8 characters/);

  const ok = await fresh.form(`/reset/${token}`, { password: 'a brand new password' });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), '/dashboard');
  assert.equal((await fresh.get('/dashboard')).status, 200, 'logged in by the reset itself');
  assert.equal((await me.get('/dashboard')).status, 302, 'the old session is gone');

  assert.equal((await person().form('/login', { email: 'p@x.com', password: 'hunter2hunter2' })).status, 401, 'old password dead');
  assert.equal((await person().form('/login', { email: 'p@x.com', password: 'a brand new password' })).status, 302);

  const again = await person().get(`/reset/${token}`);
  assert.equal(again.status, 400, 'the link is single use');
  assert.match(await again.text(), /expired/);
  assert.equal((await person().form(`/reset/${token}`, { password: 'another password!' })).status, 400);
});

test('expired, forged and malformed links all look the same', async (t) => {
  const sent = resend(t);
  const { person, db } = await serve(t);
  await person().signup();
  await person().form('/forgot', { email: 'p@x.com' });
  await until(() => sent.length);
  const token = tokenIn(sent[0]);
  db.prepare('UPDATE password_resets SET expires_at = unixepoch() - 1').run();
  for (const tkn of [token, 'x'.repeat(43), 'short', '../../etc/passwd'.replace(/\//g, '-')]) {
    const res = await person().get(`/reset/${tkn}`);
    assert.equal(res.status, 400, tkn);
    assert.match(await res.text(), /That link has expired/);
  }
});

test('the reset page keeps its secret out of Referer headers and caches', async (t) => {
  const sent = resend(t);
  const { person } = await serve(t);
  await person().signup();
  await person().form('/forgot', { email: 'p@x.com' });
  await until(() => sent.length);
  const res = await person().get(`/reset/${tokenIn(sent[0])}`);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(await res.text(), /name="robots" content="noindex/);
});

test('if Resend fails the visitor still sees the normal answer, and the failure is logged', async (t) => {
  const sent = resend(t, { status: 403 });
  const errors = []; const realErr = console.error; console.error = (...a) => errors.push(a.join(' '));
  t.after(() => { console.error = realErr; });
  const { person } = await serve(t);
  await person().signup();
  const res = await person().form('/forgot', { email: 'p@x.com' });
  assert.equal(res.status, 200);
  assert.match(await res.text(), GENERIC);
  await until(() => errors.length);
  assert.equal(sent.length, 1);
  assert.match(errors[0], /Resend answered 403/);
});

test('without a key: development prints the email, production refuses loudly (and still answers normally)', async (t) => {
  resend(t, { key: null });
  const logs = [], errors = []; const L = console.log, E = console.error;
  console.log = (...a) => logs.push(a.join(' ')); console.error = (...a) => errors.push(a.join(' '));
  t.after(() => { console.log = L; console.error = E; });
  const { person } = await serve(t);
  await person().signup();

  await person().form('/forgot', { email: 'p@x.com' });
  await until(() => logs.some((l) => l.includes('/reset/')));
  assert.ok(logs.some((l) => l.includes('mail, not sent') && l.includes('/reset/')), 'link printed for local testing');

  const was = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  t.after(() => (was === undefined ? delete process.env.NODE_ENV : (process.env.NODE_ENV = was)));
  const db2 = (await serve(t));
  const p2 = db2.person(); await p2.signup();
  const res = await p2.form('/forgot', { email: 'p@x.com' });
  assert.match(await res.text(), GENERIC);
  await until(() => errors.length);
  assert.match(errors[0], /RESEND_API_KEY is not set/);
});

test('in production the emailed link uses the real address, not the Host header', async (t) => {
  const sent = resend(t);
  const was = { env: process.env.NODE_ENV, site: process.env.SITE_URL };
  process.env.NODE_ENV = 'production'; delete process.env.SITE_URL;
  t.after(() => { for (const [k, v] of [['NODE_ENV', was.env], ['SITE_URL', was.site]]) v === undefined ? delete process.env[k] : (process.env[k] = v); });
  const { person } = await serve(t);
  await person().signup();
  await person().form('/forgot', { email: 'p@x.com' });
  await until(() => sent.length);
  assert.match(sent[0].body.text, /https:\/\/quadsort\.com\/reset\/[\w-]{43}/);
});

test('login offers the way back in', async (t) => {
  const { person } = await serve(t);
  assert.match(await (await person().get('/login')).text(), /href="\/forgot">Forgot your password\?/);
  assert.doesNotMatch(await (await person().get('/signup')).text(), /Forgot your password/);
  assert.match(await (await person().get('/forgot')).text(), /Send the link/);
});
