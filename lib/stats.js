const { check } = require('./puzzle');

// Cheap: one indexed GROUP BY. dist = players finishing with 0,1,2,3 mistakes, then losses.
function counts(db, id) {
  const dist = [0, 0, 0, 0, 0];
  let plays = 0, wins = 0, mistakes = 0;
  for (const r of db.prepare('SELECT won, mistakes, COUNT(*) n FROM plays WHERE puzzle_id = ? GROUP BY won, mistakes').all(id)) {
    dist[r.won ? r.mistakes : 4] += r.n;
    plays += r.n;
    if (r.won) wins += r.n;
    mistakes += r.mistakes * r.n;
  }
  return { plays, wins, solveRate: plays ? wins / plays : null, avgMistakes: plays ? mistakes / plays : null, dist };
}

// Pricier (parses guesses), so it only looks at the latest plays. Needs 2+ players to call it "common".
function topWrong(db, id, groups, limit = 2000) {
  const tally = new Map();
  for (const { guesses_json } of db.prepare(
    'SELECT guesses_json FROM plays WHERE puzzle_id = ? ORDER BY created_at DESC LIMIT ?').all(id, limit)) {
    for (const words of JSON.parse(guesses_json)) {
      const r = check(groups, words);
      if (!r || r.result === 'correct') continue;
      const k = [...words].sort().join('|');
      tally.set(k, (tally.get(k) || 0) + 1);
    }
  }
  let best = null;
  for (const [k, n] of tally) if (!best || n > best.count) best = { words: k.split('|'), count: n };
  return best && best.count >= 2 ? best : null;
}

// 1 (Gentle) to 4 (Devious) from how many people solve it. null until enough people have played.
function difficulty(c) {
  if (c.plays < 5) return null;
  return c.solveRate >= 0.75 ? 1 : c.solveRate >= 0.55 ? 2 : c.solveRate >= 0.35 ? 3 : 4;
}

module.exports = { counts, topWrong, difficulty };
