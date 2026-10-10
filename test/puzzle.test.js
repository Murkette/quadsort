const test = require('node:test');
const assert = require('node:assert');
const { check, replay } = require('../lib/puzzle');

const G = [
  { name: 'A', level: 1, words: ['a1', 'a2', 'a3', 'a4'] },
  { name: 'B', level: 2, words: ['b1', 'b2', 'b3', 'b4'] },
  { name: 'C', level: 3, words: ['c1', 'c2', 'c3', 'c4'] },
  { name: 'D', level: 4, words: ['d1', 'd2', 'd3', 'd4'] },
];
const wrong = (i) => [['a1', 'a2', 'b1', 'b2'], ['a1', 'a2', 'c1', 'c2'], ['a1', 'a2', 'd1', 'd2'], ['b1', 'b2', 'c1', 'c2']][i];

test('check: correct, one away, wrong, malformed', () => {
  assert.equal(check(G, ['a1', 'a2', 'a3', 'a4']).group, G[0]);
  assert.equal(check(G, ['a1', 'a2', 'a3', 'b1']).result, 'one_away');
  assert.equal(check(G, ['a1', 'a2', 'b1', 'b2']).result, 'wrong');
  assert.equal(check(G, ['a1', 'a1', 'a2', 'a3']), null);
  assert.equal(check(G, ['a1', 'a2', 'a3', 'nope']), null);
  assert.equal(check(G, 'a1'), null);
});

test('replay: win, loss, and refusing fake or unfinished games', () => {
  const all = G.map((g) => g.words);
  assert.deepEqual(replay(G, all), { won: true, mistakes: 0 });
  assert.deepEqual(replay(G, [wrong(0), ...all]), { won: true, mistakes: 1 });
  assert.deepEqual(replay(G, [0, 1, 2, 3].map(wrong)), { won: false, mistakes: 4 });
  assert.equal(replay(G, [wrong(0)]), null, 'one mistake is not a finished game');
  assert.equal(replay(G, all.slice(0, 3)), null, 'three groups is not finished');
  assert.equal(replay(G, [...all, wrong(0)]), null, 'guess after the game ended');
  assert.equal(replay(G, [wrong(0), wrong(0), wrong(1), wrong(2), wrong(3)]), null, 'repeated guess');
  assert.equal(replay(G, []), null);
});
