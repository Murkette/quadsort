const express = require('express');
const crypto = require('crypto');
const { shuffle } = require('../lib/puzzle');
const { counts, topWrong, difficulty } = require('../lib/stats');
const { initials, linkInfo } = require('../lib/util');
const { LEVELS, TAGS } = require('../public/js/validate');
const { search } = require('../lib/browse');
const { REASONS } = require('../lib/reports');

const blankGroup = (level) => ({ name: '', level, words: ['', '', '', ''] });
const need = (req, res, next) => (req.user ? next() : res.redirect('/login?next=' + encodeURIComponent(req.originalUrl)));
const rate = (c) => (c.solveRate === null ? '–' : Math.round(c.solveRate * 100) + '%');

module.exports = (db) => {
  const r = express.Router();
  const find = db.prepare(`
    SELECT p.id, p.title, p.description, p.groups_json, p.user_id, p.is_flagged,
           u.username, u.display_name, u.social_url
    FROM puzzles p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ? AND p.is_published = 1`);
  const random = db.prepare(
    'SELECT id FROM puzzles WHERE is_published = 1 AND is_flagged = 0 ORDER BY random() LIMIT 1');
  const countBy = db.prepare('SELECT COUNT(*) n FROM puzzles WHERE user_id = ? AND is_published = 1');
  const moreBy = db.prepare(`SELECT id, title FROM puzzles
    WHERE user_id = ? AND id != ? AND is_published = 1 AND is_flagged = 0 ORDER BY created_at DESC LIMIT 2`);
  const mine = db.prepare('SELECT * FROM puzzles WHERE id = ? AND user_id = ?');
  const userByName = db.prepare('SELECT id, username, display_name, bio, social_url, created_at FROM users WHERE username = ?');
  const listPublic = db.prepare(`SELECT id, title, created_at FROM puzzles
    WHERE user_id = ? AND is_published = 1 AND is_flagged = 0 ORDER BY created_at DESC LIMIT 60`);
  const listAll = db.prepare(`SELECT id, title, groups_json, is_flagged, created_at FROM puzzles
    WHERE user_id = ? AND is_published = 1 ORDER BY created_at DESC LIMIT 100`);

  const madeThisWeek = db.prepare('SELECT COUNT(*) n FROM puzzles WHERE is_published = 1 AND created_at > ?');

  r.get('/', (req, res) => {
    const weekly = madeThisWeek.get(Math.floor(Date.now() / 1000) - 7 * 86400).n;
    res.render('index', {
      fullTitle: 'Quadsort · Make a word puzzle. Send the link.',
      trending: search(db, { sort: 'trending', per: 4 }).rows, LEVELS, rate,
      picks: search(db, { featured: true, sort: 'new', per: 4 }).rows,
      weekly: weekly >= 10 ? weekly : 0, // a tiny number looks sad, so only brag when it's real
      scripts: ['/js/common.js', '/js/demo.js'],
    });
  });

  r.get('/browse', (req, res) => {
    const found = search(db, req.query);
    // /browse?sort=new&tag=food&q=cheese&page=2, dropping anything that's still the default
    const href = (o) => {
      const v = { q: found.q, tag: found.tag, sort: found.sort, page: 1, ...o };
      const p = new URLSearchParams();
      if (v.q) p.set('q', v.q);
      if (v.tag) p.set('tag', v.tag);
      if (v.sort !== 'trending') p.set('sort', v.sort);
      if (v.page > 1) p.set('page', v.page);
      return '/browse' + (p.size ? '?' + p : '');
    };
    res.render('browse', { title: 'Browse', noindex: !!found.q /* search results are not for search engines */, description: 'Word-grouping puzzles made by people, scored by real players.', ...found, href, TAGS, LEVELS, rate });
  });

  r.get('/random', (req, res, next) => {
    const p = random.get();
    p ? res.redirect(`/p/${p.id}`) : next();
  });

  // ---------- for search engines ----------
  r.get('/robots.txt', (req, res) => res.type('text/plain').send([
    'User-agent: *',
    ...['/admin', '/api/', '/dashboard', '/settings', '/login', '/signup', '/forgot', '/reset/', '/create', '/random', '/p/*/edit', '/*?q='].map((p) => 'Disallow: ' + p),
    '', `Sitemap: ${res.locals.origin}/sitemap.xml`, '',
  ].join('\n')));

  const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
  const sitemapPuzzles = db.prepare('SELECT id, updated_at FROM puzzles WHERE is_published = 1 AND is_flagged = 0 ORDER BY created_at DESC LIMIT 5000');
  const sitemapUsers = db.prepare(`SELECT u.username, MAX(p.updated_at) t FROM users u JOIN puzzles p ON p.user_id = u.id
    WHERE p.is_published = 1 AND p.is_flagged = 0 GROUP BY u.id ORDER BY t DESC LIMIT 2000`);
  const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
  // ponytail: capped at 5000 puzzles + 2000 profiles (the protocol allows 50k URLs per file). Past that, split into a sitemap index.
  r.get('/sitemap.xml', (req, res) => {
    const o = res.locals.origin;
    const url = (path, t) => `  <url><loc>${xml(o + path)}</loc>${t ? `<lastmod>${day(t)}</lastmod>` : ''}</url>`;
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send([
      '<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      url('/'), url('/browse'),
      ...sitemapPuzzles.all().map((p) => url('/p/' + p.id, p.updated_at)),
      ...sitemapUsers.all().map((u) => url('/u/' + u.username, u.t)),
      '</urlset>', '',
    ].join('\n'));
  });

  // ---------- making ----------
  const editor = (res, form, puzzleId = '', plays = 0) => res.render('create', {
    title: puzzleId ? 'Edit puzzle' : 'Make a puzzle', noindex: true, form, puzzleId, plays, LEVELS, TAGS,
    scripts: ['/js/common.js', '/js/validate.js', '/js/create.js'],
  });

  r.get('/create', (req, res) => editor(res, { title: '', description: '', tags: [], groups: [1, 2, 3, 4].map(blankGroup) }));

  r.get('/p/:id/edit', need, (req, res, next) => {
    const p = mine.get(req.params.id, req.user.id);
    if (!p) return next();
    editor(res, {
      title: p.title, description: p.description, tags: p.tags ? p.tags.split(',') : [], groups: JSON.parse(p.groups_json),
    }, p.id, counts(db, p.id).plays);
  });

  // ---------- playing ----------
  r.get('/p/:id', (req, res, next) => {
    const row = find.get(req.params.id);
    if (!row) return next();
    // Hidden by a moderator: gone for the public; the creator and admins can still open it (with a banner).
    const mayView = req.user && (req.user.is_admin || req.user.id === row.user_id);
    if (row.is_flagged && !mayView) return next();
    const groups = JSON.parse(row.groups_json);
    const words = shuffle(groups.flatMap((g) => g.words));
    const creator = row.username && {
      username: row.username, name: row.display_name, initials: initials(row.display_name), ...linkInfo(row.social_url),
      puzzles: countBy.get(row.user_id).n,
      more: moreBy.all(row.user_id, row.id).map((m) => ({ ...m, solveRate: counts(db, m.id).solveRate })),
    };
    const stats = counts(db, row.id);
    // The preview is the pitch. With enough plays, the solve rate is the best line we have.
    const pct = stats.plays ? Math.round(stats.solveRate * 100) : 0;
    const challenge = stats.plays >= 20 ? ` ${pct < 50 ? 'Only ' : ''}${pct}% of ${stats.plays.toLocaleString('en-US')} players solve it.` : '';
    const lead = row.description || 'Sixteen words, four hidden groups. Can you sort them?';
    res.render('play', {
      title: row.title,
      noindex: !!row.is_flagged,
      description: `${lead} A Quadsort puzzle${creator ? ' by ' + creator.name : ''}.${challenge}`.slice(0, 220),
      puzzle: { id: row.id, title: row.title, description: row.description }, hidden: !!row.is_flagged, REASONS,
      // changes whenever the words change, so a player's saved progress never outlives the puzzle it was for
      rev: crypto.createHash('sha1').update(row.groups_json).digest('hex').slice(0, 8),
      creator, words, stats,
      lenClass: (w) => (w.length <= 5 ? 1 : w.length <= 7 ? 2 : w.length <= 9 ? 3 : 4),
      scripts: ['/js/common.js', '/js/results.js', '/js/play.js', '/js/report.js'], // results first so it is listening when play finishes
    });
  });

  // ---------- creators ----------
  const totals = (list) => {
    const t = { puzzles: list.length, plays: 0, wins: 0, mistakes: 0 };
    list.forEach((p) => { t.plays += p.plays; t.wins += p.wins; t.mistakes += (p.avgMistakes || 0) * p.plays; });
    t.solve = t.plays ? Math.round((t.wins / t.plays) * 100) + '%' : '–';
    t.avgMistakes = t.plays ? (t.mistakes / t.plays).toFixed(1) : '–';
    return t;
  };

  r.get('/u/:username', (req, res, next) => {
    const u = userByName.get(req.params.username);
    if (!u) return next();
    const list = listPublic.all(u.id).map((p) => {
      const c = counts(db, p.id);
      return { ...p, ...c, diff: difficulty(c) };
    });
    const sort = { plays: (a, b) => b.plays - a.plays, hard: (a, b) => (b.diff || 0) - (a.diff || 0) || b.plays - a.plays }[req.query.sort];
    if (sort) list.sort(sort);
    res.render('profile', {
      title: u.display_name, description: u.bio || `Puzzles by ${u.display_name} on Quadsort.`,
      p: { ...u, initials: initials(u.display_name), ...linkInfo(u.social_url),
        since: new Date(u.created_at * 1000).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) },
      list, totals: totals(list), sort: sort ? req.query.sort : 'new', LEVELS, rate,
    });
  });

  r.get('/dashboard', need, (req, res) => {
    const list = listAll.all(req.user.id).map((p) => {
      const c = counts(db, p.id);
      return { id: p.id, title: p.title, flagged: !!p.is_flagged, ...c, wrong: topWrong(db, p.id, JSON.parse(p.groups_json), 500) };
    });
    res.render('dashboard', { title: 'My puzzles', noindex: true, list, totals: totals(list), rate, scripts: ['/js/common.js', '/js/dashboard.js'] });
  });

  return r;
};
