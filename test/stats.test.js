const test = require('node:test');
const assert = require('node:assert');
const open = require('../db');
const { counts, topWrong } = require('../lib/stats');

const groups = JSON.parse(open(':memory:').prepare("SELECT groups_json g FROM puzzles WHERE id='demo0001'").get().g);
const play = (db, key, won, mistakes, guesses = []) =>
  db.prepare('INSERT INTO plays (puzzle_id, player_key, won, mistakes, guesses_json) VALUES (?,?,?,?,?)')
    .run('demo0001', key, won, mistakes, JSON.stringify(guesses));

test('counts: solve rate, average mistakes and distribution', () => {
  const db = open(':memory:');
  assert.equal(counts(db, 'demo0001').solveRate, null, 'no plays yet');
  play(db, 'a', 1, 0); play(db, 'b', 1, 1); play(db, 'c', 1, 1); play(db, 'd', 0, 4);
  const c = counts(db, 'demo0001');
  assert.deepEqual(c.dist, [1, 2, 0, 0, 1]);
  assert.equal(c.plays, 4);
  assert.equal(c.solveRate, 0.75);
  assert.equal(c.avgMistakes, 1.5);
});

test('topWrong: needs two players, ignores correct guesses', () => {
  const db = open(':memory:');
  const bad = ['Mouse', 'Door', 'Swing', 'Battery'];
  const good = ['Brie', 'Feta', 'Edam', 'Halloumi'];
  play(db, 'a', 1, 1, [bad, good]);
  assert.equal(topWrong(db, 'demo0001', groups), null, 'one player is not "common"');
  play(db, 'b', 1, 1, [[...bad].reverse(), good]);
  const t = topWrong(db, 'demo0001', groups);
  assert.equal(t.count, 2);
  assert.deepEqual(t.words, [...bad].sort());
});
