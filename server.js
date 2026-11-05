const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const open = require('./db');
const { sessions } = require('./lib/auth');
const { initials, dailyLine } = require('./lib/util');
const { makeDaily } = require('./lib/daily');

// opts.now and opts.onPick exist so tests can control the clock and capture notifications.
// Asset URLs carry a fingerprint of the file (/css/site.css?v=3f9a1c2e). Browsers may keep them for a week,
// and the fingerprint changes the moment a file does, so nobody ever gets new pages with old styles.
const PUBLIC = path.join(__dirname, 'public');
const fingerprints = new Map();
function asset(p) {
  const prod = process.env.NODE_ENV === 'production';
  if (!prod || !fingerprints.has(p)) {
    let v = '0';
    try { v = crypto.createHash('sha1').update(fs.readFileSync(path.join(PUBLIC, p))).digest('hex').slice(0, 8); } catch { /* missing file: unversioned */ }
    fingerprints.set(p, v);
  }
  return `${p}?v=${fingerprints.get(p)}`;
}

function createApp(db = open(), opts = {}) {
  const daily = makeDaily(db, { now: opts.now, onPick: 'onPick' in opts ? opts.onPick : require('./lib/notify')(db) });
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', 'loopback'); // Caddy sits in front; use the real client IP for rate limits
  app.disable('x-powered-by');
  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  }));

  app.get('/healthz', (req, res) => {
    db.prepare('SELECT 1').get();
    res.type('text').send('ok');
  });
  const auth = sessions(db);
  app.use((req, res, next) => { // who is this? (after static + healthz, so assets never hit the database)
    res.locals.user = req.user = auth.user(req);
    res.locals.initials = initials;
    res.locals.dailyLine = dailyLine;
    res.locals.asset = asset;
    // Absolute URLs for canonical links and share images. Production pins the real address (never trust the Host header there).
    res.locals.origin = process.env.SITE_URL || (process.env.NODE_ENV === 'production' ? 'https://quadsort.com' : `${req.protocol}://${req.get('host')}`);
    res.locals.canonical = res.locals.origin + req.path;
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/api', express.json({ limit: '16kb' }), require('./routes/api')(db, daily));
  app.use('/admin', require('./routes/admin')(db, daily));
  app.use(require('./routes/auth')(db, auth));
  app.use(require('./routes/reset')(db, auth));
  app.use(require('./routes/pages')(db, daily));
  app.use((req, res) => res.status(404).render('404', { title: 'Page not found', noindex: true }));
  return app;
}

module.exports = createApp;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  // Bound to loopback: Caddy is the only thing that talks to us.
  createApp().listen(port, '127.0.0.1', () => console.log(`Quadsort on http://127.0.0.1:${port}`));
}
