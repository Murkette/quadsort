const express = require('express');
const crypto = require('crypto');
const { shuffle } = require('../lib/puzzle');
const { counts } = require('../lib/stats');
const owner = require('../lib/owner');
const { LEVELS, TAGS } = require('../public/js/validate');

const lenClass = (w) => (w.length <= 5 ? 1 : w.length <= 7 ? 2 : w.length <= 9 ? 3 : 4);
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Only http(s) links are ever rendered, so a stored javascript: URL can't become a link.
function linkInfo(url) {
  if (!/^https?:\/\//i.test(url || '')) return { social: null, host: null, handle: null };
  const u = new URL(url);
  const seg = u.pathname.split('/').filter(Boolean).pop(); // instagram.com/priyamakes -> @priyamakes
  return { social: url, host: u.hostname.replace(/^www\./, ''), handle: seg ? '@' + seg.replace(/^@/, '') : null };
}

const blankGroup = (level) => ({ name: '', level, words: ['', '', '', ''] });

module.exports = (db) => {
  const r = express.Router();
  const find = db.prepare(`
    SELECT p.id, p.title, p.description, p.groups_json, p.user_id, p.creator_name, p.creator_url,
           u.username, u.display_name, u.social_url
    FROM puzzles p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ? AND p.is_published = 1`);
  const random = db.prepare(
    'SELECT id FROM puzzles WHERE is_published = 1 AND is_flagged = 0 ORDER BY random() LIMIT 1');
  const countBy = db.prepare('SELECT COUNT(*) n FROM puzzles WHERE user_id = ? AND is_published = 1');
  const moreBy = db.prepare(`SELECT id, title FROM puzzles
    WHERE user_id = ? AND id != ? AND is_published = 1 AND is_flagged = 0 ORDER BY created_at DESC LIMIT 2`);
  const mine = db.prepare('SELECT * FROM puzzles WHERE id = ? AND owner_key = ?');

  r.get('/', (req, res) => res.render('index'));

  r.get('/random', (req, res, next) => {
    const p = random.get();
    p ? res.redirect(`/p/${p.id}`) : next();
  });

  const editor = (res, form, puzzleId = '', plays = 0) => res.render('create', {
    title: puzzleId ? 'Edit puzzle' : 'Make a puzzle', form, puzzleId, plays, LEVELS, TAGS,
    scripts: ['/js/common.js', '/js/validate.js', '/js/create.js'],
  });

  r.get('/create', (req, res) => editor(res, {
    title: '', creatorName: '', description: '', link: '', tags: [], groups: [1, 2, 3, 4].map(blankGroup),
  }));

  // Only the browser that published it (owner cookie) can open the editor; everyone else gets a 404.
  r.get('/p/:id/edit', (req, res, next) => {
    const key = owner.read(req);
    const p = key && mine.get(req.params.id, key);
    if (!p) return next();
    editor(res, {
      title: p.title, creatorName: p.creator_name || '', description: p.description, link: p.creator_url || '',
      tags: p.tags ? p.tags.split(',') : [], groups: JSON.parse(p.groups_json),
    }, p.id, counts(db, p.id).plays);
  });

  r.get('/p/:id', (req, res, next) => {
    const row = find.get(req.params.id);
    if (!row) return next();
    const groups = JSON.parse(row.groups_json);
    const words = shuffle(groups.flatMap((g) => g.words));

    let creator = null;
    if (row.username) {
      creator = {
        username: row.username, name: row.display_name, initials: initials(row.display_name), ...linkInfo(row.social_url),
        puzzles: countBy.get(row.user_id).n,
        more: moreBy.all(row.user_id, row.id).map((m) => ({ ...m, solveRate: counts(db, m.id).solveRate })),
      };
    } else if (row.creator_name) { // published anonymously: credited, but no profile page
      creator = { username: null, name: row.creator_name, initials: initials(row.creator_name), ...linkInfo(row.creator_url), puzzles: null, more: [] };
    }

    res.render('play', {
      title: row.title,
      description: row.description || `A Quadsort puzzle by ${creator ? creator.name : 'Quadsort'}. Make four groups of four.`,
      puzzle: { id: row.id, title: row.title, description: row.description },
      // changes whenever the words change, so a player's saved progress never outlives the puzzle it was for
      rev: crypto.createHash('sha1').update(row.groups_json).digest('hex').slice(0, 8),
      creator, words, lenClass, stats: counts(db, row.id),
      scripts: ['/js/common.js', '/js/results.js', '/js/play.js'], // results first so it is listening when play finishes
    });
  });

  return r;
};
