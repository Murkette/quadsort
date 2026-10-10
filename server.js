const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const open = require('./db');

function createApp(db = open()) {
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
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/api', express.json({ limit: '16kb' }), require('./routes/api')(db));
  app.use(require('./routes/pages')(db));
  app.use((req, res) => res.status(404).render('404'));
  return app;
}

module.exports = createApp;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  // Bound to loopback: Caddy is the only thing that talks to us.
  createApp().listen(port, '127.0.0.1', () => console.log(`Quadsort on http://127.0.0.1:${port}`));
}
