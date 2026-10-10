const test = require('node:test');
const assert = require('node:assert');
const createApp = require('../server');
const open = require('../db');
const { validate, normUrl } = require('../public/js/validate');

const good = () => ({
  title: 'Group Chat Chaos', description: 'Allegedly.', tags: ['food'],
  groups: [
    { level: 1, name: 'Cheeses', words: ['Brie', 'Feta', 'Edam', 'Halloumi'] },
    { level: 2, name: '___board', words: ['Surf', 'Key', 'Cup', 'Skate'] },
    { level: 3, name: 'Things that squeak', words: ['Mouse', 'Trainers', 'Door', 'Swing'] },
    { level: 4, name: 'Hiding an animal', words: ['Catastrophe', 'Pigment', 'Battery', 'Rational'] },
  ],
});
const fields = (r) => r.errors.map((e) => e.field).sort();

test('validate: a good puzzle passes and is normalised', () => {
  const r = validate(good());
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual(r.value.groups.map((g) => g.level), [1, 2, 3, 4]);
});

test('validate: duplicates (any case), long words, empties, repeated names and levels', () => {
  const p = good();
  p.groups[1].words[0] = 'BRIE';                    // duplicate of Brie, different case
  p.groups[3].words[0] = 'Rationalisation';         // 15 chars
  p.groups[2].words[3] = '  ';                      // empty
  p.groups[2].name = 'cheeses';                     // repeated name
  p.groups[0].level = 4;                            // repeated level
  const r = validate(p);
  assert.ok(!r.ok);
  const tone = (f) => r.errors.find((e) => e.field === f).tone;
  assert.equal(tone('g1.w0'), 'err');
  assert.equal(tone('g3.w0'), 'warn');
  assert.equal(tone('g2.w3'), 'missing');
  assert.equal(tone('g2.name'), 'err');
  assert.equal(tone('g3.level'), 'err');
});

test('validate: links must be http(s); scripts and junk are refused', () => {
  assert.equal(normUrl('javascript:alert(1)'), null);
  assert.equal(normUrl('ftp://example.com/x'), null);
  assert.equal(normUrl('nodots'), null);
  assert.equal(normUrl(''), '');
  assert.equal(normUrl('https://tiktok.com/@priya'), 'https://tiktok.com/@priya');
});

test('validate: missing basics, topics, and garbage input', () => {
  assert.deepEqual(fields(validate({ ...good(), title: '' })), ['title']);
  assert.deepEqual(fields(validate({ ...good(), tags: ['food', 'nope'] })), ['tags']);
  assert.deepEqual(fields(validate({ ...good(), tags: ['food', 'sport', 'music', 'gaming'] })), ['tags']);
  assert.ok(!validate(null).ok);
  assert.ok(!validate({ groups: 'x' }).ok);
  assert.equal(validate({ ...good(), title: 'a\u0000b\n  c' }).value.title, 'a b c', 'control chars and runs of space collapse');
});


// ---------- API (needs an account) ----------
const { serve, good: goodPuzzle } = require('./helpers');

test('publishing needs an account, and the puzzle is credited to it', async (t) => {
  const { person } = await serve(t);
  const anon = person();
  assert.equal((await anon.post('/api/puzzles', goodPuzzle())).status, 401);

  const me = person();
  assert.equal((await me.signup()).status, 302);
  const res = await me.post('/api/puzzles', goodPuzzle());
  assert.equal(res.status, 201);
  const { id, url: path } = await res.json();
  assert.match(id, /^[0-9a-zA-Z]{8}$/);

  const html = await (await anon.get(path)).text();
  assert.match(html, /href="\/u\/priya">Priya Makes Puzzles/);
  assert.match(html, /data-w="Halloumi"/);
  assert.doesNotMatch(html, /Things that squeak/, 'answers still hidden');
  const check = await (await anon.post('/api/plays/check', { puzzleId: id, words: ['Brie', 'Feta', 'Edam', 'Halloumi'] })).json();
  assert.equal(check.result, 'correct');
});

test('invalid puzzles are refused with field errors; bad bodies do not crash', async (t) => {
  const { person } = await serve(t);
  const me = person(); await me.signup();
  const p = goodPuzzle(); p.groups[0].words[0] = '';
  const res = await me.post('/api/puzzles', p);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).errors[0].field, 'g0.w0');
  assert.equal((await me.post('/api/puzzles', undefined)).status, 400);
  assert.equal((await me.post('/api/plays/check', undefined)).status, 404);
});

test('edit and delete: only the owner; changing groups clears plays, changing text does not', async (t) => {
  const { person, db } = await serve(t);
  const me = person(); await me.signup();
  const other = person(); await other.signup({ username: 'sam', email: 's@x.com' });
  const { id } = await (await me.post('/api/puzzles', goodPuzzle())).json();
  db.prepare("INSERT INTO plays (puzzle_id, player_key, won, mistakes, guesses_json) VALUES (?, 'someone-1', 1, 0, '[]')").run(id);

  const anon = person();
  const redirect = await anon.get(`/p/${id}/edit`);
  assert.equal(redirect.status, 302);
  assert.match(redirect.headers.get('location'), /^\/login\?next=/);
  assert.equal((await other.get(`/p/${id}/edit`)).status, 404);
  assert.equal((await other.put(`/api/puzzles/${id}`, goodPuzzle())).status, 404);
  assert.equal((await other.del(`/api/puzzles/${id}`)).status, 404);
  assert.equal((await anon.put(`/api/puzzles/${id}`, goodPuzzle())).status, 401);

  const page = await me.get(`/p/${id}/edit`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /value="Group Chat Chaos"/);

  const r1 = await (await me.put(`/api/puzzles/${id}`, { ...goodPuzzle(), title: 'Renamed' })).json();
  assert.equal(r1.statsReset, false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM plays').get().n, 1);
  const regroup = goodPuzzle(); regroup.groups[0].words[0] = 'Cheddar';
  assert.equal((await (await me.put(`/api/puzzles/${id}`, regroup)).json()).statsReset, true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM plays').get().n, 0);

  assert.equal((await me.del(`/api/puzzles/${id}`)).status, 200);
  assert.equal((await me.get(`/p/${id}`)).status, 404);
});

test('create page renders; saved play progress is tied to the words (rev)', async (t) => {
  const { person } = await serve(t);
  const me = person(); await me.signup();
  const html = await (await me.get('/create')).text();
  assert.match(html, /Make a puzzle/);
  assert.match(html, /Publishing as <b>Priya Makes Puzzles<\/b>/);
  assert.match(await (await person().get('/create')).text(), /free account when you publish/);
  const a = await (await me.post('/api/puzzles', goodPuzzle())).json();
  const g2 = goodPuzzle(); g2.groups[0].words[0] = 'Cheddar';
  const b = await (await me.post('/api/puzzles', g2)).json();
  const rev = async (id) => /data-rev="(\w+)"/.exec(await (await me.get(`/p/${id}`)).text())[1];
  assert.notEqual(await rev(a.id), await rev(b.id));
});
