const test = require('node:test');
const assert = require('node:assert');
const { make } = require('../scripts/make-puzzle');

const theme = (name, words, bait) => ({ name, words, bait });
const spec = (themes) => ({ title: 'T', themes });

test('the formatter picks the words that set the most traps', () => {
  const [r] = make(spec([
    theme('Planets', ['Venus', 'Saturn', 'Jupiter', 'Neptune', 'Mars', 'Mercury'], ['Pluto']),
    theme('Candy', ['Twix', 'Skittles', 'Snickers', 'Mars']), // Mars must live here: Candy has no spare
    theme('Metals', ['Iron', 'Zinc', 'Gold', 'Tin', 'Mercury']),
    theme('Disney dogs', ['Goofy', 'Lady', 'Tramp', 'Bolt', 'Pluto']),
  ]));
  const g = Object.fromEntries(r.puzzle.groups.map((x) => [x.name, x.words]));
  assert.ok(g.Candy.includes('Mars') && !g.Planets.includes('Mars'));
  assert.ok(g['Disney dogs'].includes('Pluto'), 'bait is pulled onto the board');
  assert.ok([...g.Planets, ...g.Metals].includes('Mercury'), 'the shared word is used once');
  assert.equal(r.traps, 3); // Mars and Pluto tempt Planets; Mercury tempts whichever of Planets and Metals it is not in
  assert.deepEqual(r.puzzle.groups.map((x) => x.level), [1, 2, 3, 4]);
  assert.equal(r.puzzle.groups.flatMap((x) => x.words).length, 16);
});

test('a board with two solutions is never produced', () => {
  // X and Y fit both A and B, and both groups need one of them: the two can always be swapped.
  assert.throws(() => make(spec([
    theme('A', ['a1', 'a2', 'a3', 'X', 'Y']), theme('B', ['b1', 'b2', 'b3', 'X', 'Y']),
    theme('C', ['c1', 'c2', 'c3', 'c4']), theme('D', ['d1', 'd2', 'd3', 'd4']),
  ])), /more than one solution/);
});

test('bad input is refused with a reason', () => {
  assert.throws(() => make(spec([theme('A', ['a', 'b', 'c'])])), /four themes/);
  assert.throws(() => make(spec(['A', 'B', 'C', 'D'].map((n) => theme(n, [n + 1, n + 2, n + 3])))), /at least four words/);
  assert.throws(() => make(spec(['A', 'B', 'C', 'D'].map((n) => theme(n, [1, 2, 3, 4].map((i) => n + 'x'.repeat(14) + i))))), /too long/);
});
