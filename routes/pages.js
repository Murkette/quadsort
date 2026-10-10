const express = require('express');
const { shuffle } = require('../lib/puzzle');
const { counts } = require('../lib/stats');

const lenClass = (w) => (w.length <= 5 ? 1 : w.length <= 7 ? 2 : w.length <= 9 ? 3 : 4);
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
// "https://instagram.com/priyamakes" -> "@priyamakes"; a bare site has no handle
const handleOf = (url) => {
  const seg = new URL(url).pathname.split('/').filter(Boolean).pop();
  return seg ? '@' + seg.replace(/^@/, '') : null;
};

module.exports = (db) => {
  const r = express.Router();
  const find = db.prepare(`
    SELECT p.id, p.title, p.description, p.groups_json, p.user_id,
           u.username, u.display_name, u.social_url
    FROM puzzles p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ? AND p.is_published = 1`);
  const random = db.prepare(
    'SELECT id FROM puzzles WHERE is_published = 1 AND is_flagged = 0 ORDER BY random() LIMIT 1');
  const countBy = db.prepare('SELECT COUNT(*) n FROM puzzles WHERE user_id = ? AND is_published = 1');
  const moreBy = db.prepare(`SELECT id, title FROM puzzles
    WHERE user_id = ? AND id != ? AND is_published = 1 AND is_flagged = 0 ORDER BY created_at DESC LIMIT 2`);

  r.get('/', (req, res) => res.render('index'));

  r.get('/random', (req, res, next) => {
    const p = random.get();
    p ? res.redirect(`/p/${p.id}`) : next();
  });

  r.get('/p/:id', (req, res, next) => {
    const row = find.get(req.params.id);
    if (!row) return next();
    const words = shuffle(JSON.parse(row.groups_json).flatMap((g) => g.words));

    let creator = null;
    if (row.username) {
      // only http(s) links are ever rendered, so a stored javascript: URL can't become a link
      const social = /^https?:\/\//i.test(row.social_url || '') ? row.social_url : null;
      creator = {
        username: row.username, name: row.display_name, initials: initials(row.display_name), social,
        host: social && new URL(social).hostname.replace(/^www\./, ''),
        handle: social && handleOf(social),
        puzzles: countBy.get(row.user_id).n,
        more: moreBy.all(row.user_id, row.id).map((m) => ({ ...m, solveRate: counts(db, m.id).solveRate })),
      };
    }

    res.render('play', {
      title: row.title,
      description: row.description || `A Quadsort puzzle by ${row.display_name || 'Quadsort'}. Make four groups of four.`,
      puzzle: { id: row.id, title: row.title, description: row.description },
      creator, words, lenClass, stats: counts(db, row.id),
      scripts: ['/js/results.js', '/js/play.js'], // results first so it is listening when play finishes
    });
  });

  return r;
};
