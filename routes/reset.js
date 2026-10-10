// "Forgot password": emailed, single-use, one-hour links. Never reveals whether an email has an account.
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { hashPassword } = require('../lib/auth');
const { send, resetEmail } = require('../lib/mail');
const { clean } = require('../public/js/validate');

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TTL = 3600;      // link lifetime, seconds
const THROTTLE = 60;   // at most one email per account per minute
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

module.exports = (db, auth) => {
  const r = express.Router();
  const form = express.urlencoded({ extended: false, limit: '4kb' });
  const notice = (res, status, heading, text, link) => res.status(status).render('notice', { title: heading, noindex: true, heading, text, link });
  const limit = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (req, res) => notice(res, 429, 'Slow down.', 'Too many attempts. Give it a few minutes.') });

  const byEmail = db.prepare('SELECT id, display_name FROM users WHERE email = ?');
  const recent = db.prepare('SELECT 1 FROM password_resets WHERE user_id = ? AND created_at > unixepoch() - ?');
  const add = db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, unixepoch() + ?)');
  const find = db.prepare('SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > unixepoch()');
  const purge = db.prepare('DELETE FROM password_resets WHERE expires_at <= unixepoch()');
  const spend = db.prepare('DELETE FROM password_resets WHERE user_id = ?');
  const setPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');

  r.get('/forgot', (req, res) => res.render('forgot', { title: 'Forgot password', noindex: true, error: null, email: '' }));

  r.post('/forgot', limit, form, (req, res) => {
    const email = clean(req.body.email).toLowerCase();
    const u = EMAIL.test(email) && email.length <= 254 && byEmail.get(email);
    purge.run();
    if (u && !recent.get(u.id, THROTTLE)) {
      const token = crypto.randomBytes(32).toString('base64url');
      add.run(sha(token), u.id, TTL);
      const link = `${res.locals.origin}/reset/${token}`;
      // Not awaited: an existing account must not answer slower than a missing one. Failures are logged, never shown.
      send({ to: email, ...resetEmail({ name: u.display_name, link }) }).catch((e) => console.error('password reset email failed:', e.message));
    }
    notice(res, 200, 'Check your inbox.', 'If that email has an account, a reset link is on its way. It works for an hour. Check spam if it is shy.',
      { href: '/login', label: 'Back to log in' });
  });

  // The link carries a secret, so keep it out of Referer headers and caches.
  const guard = (req, res, next) => { res.set({ 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }); next(); };
  const owner = (token) => /^[\w-]{40,64}$/.test(token) && find.get(sha(token));
  const dead = (res) => notice(res, 400, 'That link has expired.', 'Reset links work once, for an hour. Ask for a fresh one.', { href: '/forgot', label: 'Send a new link' });

  r.get('/reset/:token', guard, (req, res) => (owner(req.params.token)
    ? res.render('reset', { title: 'New password', noindex: true, token: req.params.token, error: null }) : dead(res)));

  r.post('/reset/:token', guard, limit, form, async (req, res) => {
    const row = owner(req.params.token);
    if (!row) return dead(res);
    const pw = typeof req.body.password === 'string' ? req.body.password : '';
    if (pw.length < 8 || pw.length > 200) {
      return res.status(400).render('reset', { title: 'New password', noindex: true, token: req.params.token, error: pw.length < 8 ? 'At least 8 characters.' : 'That is a lot of password. 200 characters max.' });
    }
    setPassword.run(await hashPassword(pw), row.user_id);
    spend.run(row.user_id);       // every outstanding link for this account dies with this one
    auth.endAll(row.user_id);     // and anyone already logged in (possibly the person who shouldn't be) is signed out
    auth.start(res, row.user_id);
    res.redirect('/dashboard');
  });

  return r;
};
