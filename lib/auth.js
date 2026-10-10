// Accounts: scrypt passwords (Node built-in, no dependency) and cookie sessions kept in SQLite.
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const COOKIE = 'qs_session';
const DAYS = 30;

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${(await scrypt(pw, salt, 64)).toString('hex')}`;
}
async function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const got = await scrypt(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
}
// Checked against when the email is unknown, so "no such user" takes as long as "wrong password".
const DUMMY = hashPassword('not-a-real-password');

// Only same-site paths, so ?next= can't bounce someone to another site after login.
const safeNext = (n, fallback = '/dashboard') => (typeof n === 'string' && /^\/(?![/\\])/.test(n) ? n : fallback);

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex'); // only the hash is stored

function sessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= unixepoch()').run();
  const add = db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)');
  const find = db.prepare(`SELECT u.id, u.username, u.email, u.display_name, u.bio, u.social_url, u.is_admin, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > unixepoch()`);
  const drop = db.prepare('DELETE FROM sessions WHERE id = ?');
  const dropAll = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  const token = (req) => (/(?:^|;\s*)qs_session=([\w-]{40,64})/.exec(req.headers.cookie || '') || [])[1];

  return {
    start(res, userId) {
      const t = crypto.randomBytes(32).toString('base64url');
      add.run(sha(t), userId, Math.floor(Date.now() / 1000) + DAYS * 86400);
      res.cookie(COOKIE, t, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: DAYS * 86400 * 1000 });
    },
    user(req) { const t = token(req); return (t && find.get(sha(t))) || null; },
    endAll(userId) { dropAll.run(userId); },
    end(req, res) { const t = token(req); if (t) drop.run(sha(t)); res.clearCookie(COOKIE); },
  };
}

module.exports = { hashPassword, checkPassword, DUMMY, safeNext, sessions };
