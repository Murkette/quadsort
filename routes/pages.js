const express = require('express');
const { shuffle } = require('../lib/puzzle');

const lenClass = (w) => (w.length <= 5 ? 1 : w.length <= 7 ? 2 : w.length <= 9 ? 3 : 4);

module.exports = (db) => {
  const r = express.Router();
  const find = db.prepare(`
    SELECT p.id, p.title, p.description, p.groups_json,
           u.username, u.display_name, u.social_url
    FROM puzzles p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ? AND p.is_published = 1`);
  const random = db.prepare(
    'SELECT id FROM puzzles WHERE is_published = 1 AND is_flagged = 0 ORDER BY random() LIMIT 1');

  r.get('/', (req, res) => res.render('index'));

  r.get('/random', (req, res, next) => {
    const p = random.get();
    p ? res.redirect(`/p/${p.id}`) : next();
  });

  r.get('/p/:id', (req, res, next) => {
    const row = find.get(req.params.id);
    if (!row) return next();
    const words = shuffle(JSON.parse(row.groups_json).flatMap((g) => g.words));
    res.render('play', {
      title: row.title,
      description: row.description || `A Quadsort puzzle by ${row.display_name || 'Quadsort'}. Make four groups of four.`,
      puzzle: { id: row.id, title: row.title, description: row.description },
      // only http(s) links are ever rendered, so a stored javascript: URL can't become a link
      creator: row.username && { username: row.username, name: row.display_name,
        social: /^https?:\/\//i.test(row.social_url || '') ? row.social_url : null },
      words, lenClass,
      scripts: ['/js/play.js'],
    });
  });

  return r;
};
