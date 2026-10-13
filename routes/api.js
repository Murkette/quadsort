const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { check, replay, bySolution } = require('../lib/puzzle');
const { counts, topWrong } = require('../lib/stats');
const { validate, clean } = require('../public/js/validate');
const { REASONS } = require('../lib/reports');

const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const newId = () => Array.from({ length: 8 }, () => B62[crypto.randomInt(62)]).join('');

module.exports = (db, daily) => {
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

  // ---------- reporting ----------
  const live = db.prepare('SELECT 1 FROM puzzles WHERE id = ? AND is_published = 1 AND is_flagged = 0');
  const addReport = db.prepare('INSERT OR IGNORE INTO reports (puzzle_id, reporter_key, reason, note) VALUES (?, ?, ?, ?)');
  const reportLimit = rateLimit({ windowMs: 3600_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Too many reports from one place. Thanks, we have the message.' } });

  // One report per player per puzzle; repeats are accepted silently. A person decides what happens next.
  r.post('/puzzles/:id/report', reportLimit, (req, res) => {
    const { reason, note, playerKey } = req.body || {};
    if (!live.get(req.params.id)) return res.status(404).json({ error: 'no such puzzle' });
    if (!Object.hasOwn(REASONS, reason) || typeof playerKey !== 'string' || playerKey.length < 8 || playerKey.length > 64) {
      return res.status(400).json({ error: 'bad report' });
    }
    addReport.run(req.params.id, playerKey, reason, clean(note).slice(0, 200));
    res.json({ ok: true });
  });

  // ---------- publishing (accounts only) ----------
  const publishLimit = rateLimit({ windowMs: 3600_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Too many puzzles from one place. Take a breather and try again later.' } });
  const login = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'login' }));
  const make = db.prepare('INSERT INTO puzzles (id, user_id, title, description, groups_json, tags) VALUES (?, ?, ?, ?, ?, ?)');
  const owned = db.prepare('SELECT groups_json FROM puzzles WHERE id = ? AND user_id = ?');
  const update = db.prepare(`UPDATE puzzles SET title = ?, description = ?, groups_json = ?, tags = ?, updated_at = unixepoch()
    WHERE id = ? AND user_id = ?`);
  const wipePlays = db.prepare('DELETE FROM plays WHERE puzzle_id = ?');
  const remove = db.prepare('DELETE FROM puzzles WHERE id = ? AND user_id = ?'); // plays go with it (ON DELETE CASCADE)

  r.post('/puzzles', login, publishLimit, (req, res) => {
    const v = validate(req.body);
    if (!v.ok) return res.status(400).json({ errors: v.errors });
    const p = v.value;
    for (let tries = 0; tries < 5; tries++) {
      const id = newId();
      try {
        make.run(id, req.user.id, p.title, p.description, JSON.stringify(p.groups), p.tags.join(','));
        if (req.body.daily === true) daily.join(id); // opted in at publish: this is the spot a paywall goes later
        return res.status(201).json({ id, url: `/p/${id}`, daily: daily.info(id) });
      } catch (e) {
        if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e; // id collision: roll again
      }
    }
    res.status(500).json({ error: 'could not allocate an id' });
  });

  // Edit. Changing the words or groups makes old plays and stats meaningless, so they are cleared.
  // Daily rules: a puzzle that is (or was) a Daily keeps its words for good, and one waiting in line
  // keeps them while it waits. To change the words you leave the line first (and rejoin at the back).
  r.put('/puzzles/:id', login, publishLimit, (req, res) => {
    const row = owned.get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'no such puzzle' });
    const v = validate(req.body);
    if (!v.ok) return res.status(400).json({ errors: v.errors });
    const p = v.value;
    const groupsJson = JSON.stringify(p.groups);
    const changed = groupsJson !== row.groups_json;
    const before = daily.info(req.params.id).state;
    const ran = before === 'today' || before === 'was' || before === 'scheduled';
    const wants = req.body.daily; // true, false, or absent (leave as is)
    if (changed && ran) return res.status(409).json({ error: 'This puzzle is, or was, the Daily, so its words are locked. You can still change the title and description.' });
    if (changed && before === 'queued' && wants !== false) {
      return res.status(409).json({ error: 'The words are locked while this is in line for the Daily. Untick the Daily box to change them. It rejoins at the back of the line if you tick it again.' });
    }
    db.transaction(() => {
      update.run(p.title, p.description, groupsJson, p.tags.join(','), req.params.id, req.user.id);
      if (changed) wipePlays.run(req.params.id);
      if (!ran) { if (wants === true) daily.join(req.params.id); else if (wants === false) daily.leave(req.params.id); }
    })();
    res.json({ id: req.params.id, url: `/p/${req.params.id}`, statsReset: changed, daily: daily.info(req.params.id) });
  });

  // Join or leave the Daily line without editing anything (the dashboard buttons).
  r.post('/puzzles/:id/daily', login, publishLimit, (req, res) => {
    if (!owned.get(req.params.id, req.user.id)) return res.status(404).json({ error: 'no such puzzle' });
    if (!['none', 'queued'].includes(daily.info(req.params.id).state)) return res.status(409).json({ error: 'This puzzle already has its Daily.' });
    if (req.body && req.body.in === true) daily.join(req.params.id); else daily.leave(req.params.id);
    res.json({ daily: daily.info(req.params.id) });
  });

  // A Daily stays in the archive, so it can't be deleted (hiding it is a moderator's call).
  r.delete('/puzzles/:id', login, (req, res) => {
    if (owned.get(req.params.id, req.user.id) && !['none', 'queued'].includes(daily.info(req.params.id).state)) {
      return res.status(409).json({ error: 'This puzzle is, or was, a Daily, so it stays in the archive. Ask us if it needs to come down.' });
    }
    remove.run(req.params.id, req.user.id).changes ? res.json({ ok: true }) : res.status(404).json({ error: 'no such puzzle' });
  });

  return r;
};
