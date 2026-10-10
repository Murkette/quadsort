const express = require('express');
const { check, replay, bySolution } = require('../lib/puzzle');
const { counts, topWrong } = require('../lib/stats');

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
    const groups = load(req.body.puzzleId);
    if (!groups) return res.status(404).json({ error: 'no such puzzle' });
    const out = check(groups, req.body.words);
    if (!out) return res.status(400).json({ error: 'bad guess' });
    res.json(out);
  });

  // Finished game: verify it by replaying the guesses, log it once per player, reveal the solution and stats.
  r.post('/plays', (req, res) => {
    const { puzzleId, playerKey, guesses } = req.body;
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

  return r;
};
