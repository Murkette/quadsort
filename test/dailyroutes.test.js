const test = require('node:test');
const assert = require('node:assert');
const { serve, good } = require('./helpers');
const open = require('../db');

const at = (iso) => Date.parse(iso);

// A site whose clock we control, with one creator whose puzzle is first in the Daily line.
async function site(t, start = '2026-10-13T16:00:00Z') {
  let now = at(start);
  const db = open(':memory:');
  const s = await serve(t, db, { now: () => now, onPick: () => {} });
  const me = s.person(); await me.signup();
  const { id } = await (await me.post('/api/puzzles', { ...good(), title: 'Line Leader' })).json();
  db.prepare("UPDATE puzzles SET daily_opt_in_at = 100 WHERE id = ?").run(id);
  return { ...s, me, id, anon: s.person(), person: s.person, advance: (d) => { now += d * 86400000; } };
}
const attr = (html, name) => (new RegExp(`${name}="([^"]*)"`).exec(html) || [])[1];

test('/daily is today\'s puzzle, with a banner, the same words as /p/:id, and a stable address', async (t) => {
  const { anon, id, url } = await site(t);
  const html = await (await anon.get('/daily')).text();
  assert.match(html, /<p class="daily-banner"><b>The Daily<\/b> <span>#1<\/span> <span>Tuesday, October 13<\/span><\/p>/);
  assert.match(html, /<title>Daily #1: Line Leader · Quadsort<\/title>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${url}/daily">`));
  assert.match(html, /The Quadsort Daily, Tuesday, October 13\./);
  assert.equal(attr(html, 'data-puzzle'), id);
  assert.equal(attr(html, 'data-share'), '/daily');
  assert.equal(attr(html, 'data-daily'), '1');
  assert.equal(attr(html, 'data-daily-today'), '1');
  const words = (h) => [...h.matchAll(/data-w="([^"]+)"/g)].map((m) => m[1]).sort().join();
  assert.equal(words(html), words(await (await anon.get(`/p/${id}`)).text()));
  assert.doesNotMatch(html, /Cheeses|Hiding an animal|Things that squeak/, 'answers still hidden');
});

test('everyone gets the same Daily, and it changes at midnight Eastern', async (t) => {
  const { anon, person, advance, id, db } = await site(t, '2026-10-14T03:59:00Z'); // 11:59pm ET on Oct 13
  const other = person(); await other.signup({ username: 'sam', email: 's@x.com', display_name: 'Sam' }); // a different creator, so the one-a-week pause does not apply
  const id2 = (await (await other.post('/api/puzzles', { ...good(), title: 'Second In Line' })).json()).id;
  db.prepare('UPDATE puzzles SET daily_opt_in_at = 200 WHERE id = ?').run(id2);
  const who = async () => attr(await (await anon.get('/daily')).text(), 'data-puzzle');
  assert.equal(await who(), id);
  assert.equal(await who(), id, 'a second visitor gets the same one');
  advance(1 / 1440 * 2);                                // two minutes later: past midnight ET
  assert.equal(await who(), id2);
});

test('earlier days keep their own address; today redirects home; the future and nonsense are 404', async (t) => {
  const { anon, advance, id } = await site(t);
  await anon.get('/daily');
  advance(1);
  await anon.get('/daily');                              // Oct 14 is the house puzzle
  const old = await (await anon.get('/daily/2026-10-13')).text();
  assert.match(old, /<span>#1<\/span> <span>Tuesday, October 13<\/span> <a href="\/daily">Play today's<\/a>/);
  assert.equal(attr(old, 'data-puzzle'), id);
  assert.equal(attr(old, 'data-share'), '/daily/2026-10-13', 'its share link goes to its own day, not today');
  assert.equal(attr(old, 'data-daily-today'), undefined);
  const today = await anon.get('/daily/2026-10-14');
  assert.equal(today.status, 302);
  assert.equal(today.headers.get('location'), '/daily');
  for (const bad of ['2026-10-15', '2026-02-31', 'yesterday', '2026-10-12']) assert.equal((await anon.get('/daily/' + bad)).status, 404, bad);
});

test('an ordinary link to a Daily puzzle says so; other puzzles do not', async (t) => {
  const { anon, me, advance, id } = await site(t);
  await anon.get('/daily');
  assert.match(await (await anon.get(`/p/${id}`)).text(), /<a href="\/daily">Today's Daily · #1<\/a>/);
  advance(1);
  await anon.get('/daily');
  assert.match(await (await anon.get(`/p/${id}`)).text(), /<a href="\/daily\/2026-10-13">Daily #1 · Oct 13<\/a>/);
  assert.doesNotMatch(await (await anon.get(`/p/${id}`)).text(), /daily-banner/);
  const other = (await (await me.post('/api/puzzles', good())).json()).id;
  assert.doesNotMatch(await (await anon.get(`/p/${other}`)).text(), /daily-tag|daily-banner/);
});

test('if the Daily gets hidden, /daily quietly moves on to another puzzle', async (t) => {
  const { anon, db, id } = await site(t);
  assert.equal(attr(await (await anon.get('/daily')).text(), 'data-puzzle'), id);
  db.prepare('UPDATE puzzles SET is_flagged = 1 WHERE id = ?').run(id);
  const after = await (await anon.get('/daily')).text();
  assert.notEqual(attr(after, 'data-puzzle'), id);
  assert.match(after, /<span>#1<\/span>/, 'same number');
  assert.equal((await anon.get(`/p/${id}`)).status, 404);
});
