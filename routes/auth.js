const express = require('express');
const rateLimit = require('express-rate-limit');
const { hashPassword, checkPassword, DUMMY, safeNext } = require('../lib/auth');
const { clean, normUrl, LIMITS } = require('../public/js/validate');

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME = /^[a-z0-9_]{3,24}$/;

module.exports = (db, auth) => {
  const r = express.Router();
  const form = express.urlencoded({ extended: false, limit: '8kb' });
  const limit = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (req, res) => res.status(429).render('auth', { title: 'Slow down', mode: req.path.slice(1), next: safeNext(req.body && req.body.next), values: {}, errors: { form: 'Too many attempts. Give it a few minutes.' } }) });
  const byEmail = db.prepare('SELECT id, password_hash FROM users WHERE email = ?');
  const emailTaken = db.prepare('SELECT 1 FROM users WHERE email = ?');
  const nameTaken = db.prepare('SELECT 1 FROM users WHERE username = ?');
  const add = db.prepare('INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)');

  const page = (res, mode, req, values = {}, errors = {}, status = 200) =>
    res.status(status).render('auth', { title: mode === 'signup' ? 'Sign up' : 'Log in', mode, next: safeNext(req.body ? req.body.next : req.query.next, ''), values, errors });
  const need = (req, res, next) => (req.user ? next() : res.redirect('/login?next=' + encodeURIComponent(req.originalUrl)));

  for (const mode of ['signup', 'login']) {
    r.get('/' + mode, (req, res) => (req.user ? res.redirect(safeNext(req.query.next)) : page(res, mode, req)));
  }

  r.post('/signup', limit, form, async (req, res) => {
    const b = req.body;
    const email = clean(b.email).toLowerCase(), username = clean(b.username).toLowerCase();
    const name = clean(b.display_name) || username, pw = typeof b.password === 'string' ? b.password : '';
    const errors = {};
    if (!EMAIL.test(email) || email.length > 254) errors.email = "That doesn't look like an email.";
    else if (emailTaken.get(email)) errors.email = 'That email already has an account. Try logging in.';
    if (!USERNAME.test(username)) errors.username = '3 to 24 characters: letters, numbers, underscores.';
    else if (nameTaken.get(username)) errors.username = 'Taken. Be more original.';
    if (name.length > LIMITS.name) errors.display_name = `Too long (${name.length}/${LIMITS.name}).`;
    if (pw.length < 8) errors.password = 'At least 8 characters.';
    else if (pw.length > 200) errors.password = 'That is a lot of password. 200 characters max.';
    if (Object.keys(errors).length) return page(res, 'signup', req, { email, username, display_name: b.display_name }, errors, 400);

    try {
      const id = add.run(username, email, await hashPassword(pw), name).lastInsertRowid;
      auth.start(res, id);
      res.redirect(safeNext(b.next));
    } catch (e) {
      if (!String(e.code).startsWith('SQLITE_CONSTRAINT')) throw e; // lost a race for the same name/email
      page(res, 'signup', req, { email, username, display_name: b.display_name }, { form: 'Someone just took that. Try again.' }, 409);
    }
  });

  r.post('/login', limit, form, async (req, res) => {
    const email = clean(req.body.email).toLowerCase(), pw = typeof req.body.password === 'string' ? req.body.password : '';
    const u = pw.length <= 200 && byEmail.get(email);
    const ok = await checkPassword(pw.slice(0, 200), u ? u.password_hash : await DUMMY);
    if (!u || !ok) return page(res, 'login', req, { email }, { form: 'Wrong email or password. Not even close.' }, 401);
    auth.start(res, u.id);
    res.redirect(safeNext(req.body.next));
  });

  r.post('/logout', (req, res) => { auth.end(req, res); res.redirect('/'); });

  // ---------- profile settings ----------
  const update = db.prepare('UPDATE users SET display_name = ?, bio = ?, social_url = ? WHERE id = ?');
  const settings = (res, req, errors = {}, values, status = 200) => res.status(status).render('settings', {
    title: 'Settings', errors, saved: !!req.query.saved, LIMITS,
    values: values || { display_name: req.user.display_name, bio: req.user.bio, social_url: req.user.social_url || '' },
  });
  r.get('/settings', need, (req, res) => settings(res, req));
  r.post('/settings', need, form, (req, res) => {
    const name = clean(req.body.display_name), bio = clean(req.body.bio), link = normUrl(req.body.social_url);
    const errors = {};
    if (!name) errors.display_name = 'You need a name. Even a silly one.';
    else if (name.length > LIMITS.name) errors.display_name = `Too long (${name.length}/${LIMITS.name}).`;
    if (bio.length > LIMITS.bio) errors.bio = `Too long (${bio.length}/${LIMITS.bio}).`;
    if (link === null) errors.social_url = "That doesn't look like a link.";
    else if (link.length > LIMITS.link) errors.social_url = 'That link is too long.';
    if (Object.keys(errors).length) return settings(res, req, errors, { display_name: req.body.display_name, bio: req.body.bio, social_url: req.body.social_url }, 400);
    update.run(name, bio, link || null, req.user.id);
    res.redirect('/settings?saved=1');
  });

  return r;
};
