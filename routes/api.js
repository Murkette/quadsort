const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { check, replay, bySolution } = require('../lib/puzzle');
const { counts, topWrong } = require('../lib/stats');
const { validate } = require('../public/js/validate');
const owner = require('../lib/owner');

const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const newId = () => Array.from({ length: 8 }, () => B62[crypto.randomInt(62)]).join('');

module.exports = (db) => {
  const r = express.Router();
  const find = db.prepare('SELECT groups_json FROM puzzles WHERE id = ? AND is_published = 1');
  const played = db.prepare('SELECT 1 FROM plays WHERE puzzle_id = ? AND player_key = ?');
  const insert = db.prepare(
    'INSERT INTO plays (puzzle_id, player_key, won, mistakes, guesses_json) VALUES (?, ?, ?, ?, ?)');
  const load = (id) => {
    const row = typeof id === 'string' && find.get(id);
    return row && JSON.parse(row.groups_json);
  };

  // One guess. Answers never leave the server except the group that was guessed right.
  r.post('/plays/check', (req, res) => {
    const body = req.body || {};
    const groups = load(body.puzzleId);
    if (!groups) return res.status(404).json({ error: 'no such puzzle' });
    const out = check(groups, body.words);
    if (!out) return res.status(400).json({ error: 'bad guess' });
    res.json(out);
  });

  // Finished game: verify it by replaying the guesses, log it once per player, reveal the solution and stats.
  r.post('/plays', (req, res) => {
    const { puzzleId, playerKey, guesses } = req.body || {};
    const groups = load(puzzleId);
    if (!groups) return res.status(404).json({ error: 'no such puzzle' });
    const end = replay(groups, guesses);
    if (!end || typeof playerKey !== 'string' || playerKey.length < 8 || playerKey.length > 64) {
      return res.status(400).json({ error: 'not a finished game' });
    }
    if (!played.get(puzzleId, playerKey)) {
      insert.run(puzzleId, playerKey, end.won ? 1 : 0, end.mistakes, JSON.stringify(guesses));
    }
    res.json({ ...end, solution: bySolution(groups), stats: { ...counts(db, puzzleId), topWrong: topWrong(db, puzzleId, groups) } });
  });

  // ---------- publishing ----------
  const publishLimit = rateLimit({ windowMs: 3600_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Too many puzzles from one place. Take a breather and try again later.' } });
  const make = db.prepare(`INSERT INTO puzzles (id, user_id, title, description, groups_json, tags, creator_name, creator_url, owner_key)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`);
  const owned = db.prepare('SELECT groups_json FROM puzzles WHERE id = ? AND owner_key = ?');
  const update = db.prepare(`UPDATE puzzles SET title = ?, description = ?, groups_json = ?, tags = ?, creator_name = ?,
    creator_url = ?, updated_at = unixepoch() WHERE id = ? AND owner_key = ?`);
  const wipePlays = db.prepare('DELETE FROM plays WHERE puzzle_id = ?');

  r.post('/puzzles', publishLimit, (req, res) => {
    const v = validate(req.body);
    if (!v.ok) return res.status(400).json({ errors: v.errors });
    const p = v.value;
    const key = owner.ensure(req, res);
    for (let tries = 0; tries < 5; tries++) {
      const id = newId();
      try {
        make.run(id, p.title, p.description, JSON.stringify(p.groups), p.tags.join(','), p.creatorName, p.link || null, key);
        return res.status(201).json({ id, url: `/p/${id}` });
      } catch (e) {
        if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e; // id collision: roll again
      }
    }
    res.status(500).json({ error: 'could not allocate an id' });
  });

  // Edit. Changing the words or groups makes old plays and stats meaningless, so they are cleared.
  r.put('/puzzles/:id', publishLimit, (req, res) => {
    const key = owner.read(req);
    const row = key && owned.get(req.params.id, key);
    if (!row) return res.status(404).json({ error: 'no such puzzle' });
    const v = validate(req.body);
    if (!v.ok) return res.status(400).json({ errors: v.errors });
    const p = v.value;
    const groupsJson = JSON.stringify(p.groups);
    const changed = groupsJson !== row.groups_json;
    db.transaction(() => {
      update.run(p.title, p.description, groupsJson, p.tags.join(','), p.creatorName, p.link || null, req.params.id, key);
      if (changed) wipePlays.run(req.params.id);
    })();
    res.json({ id: req.params.id, url: `/p/${req.params.id}`, statsReset: changed });
  });

  return r;
};
