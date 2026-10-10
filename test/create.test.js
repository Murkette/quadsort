const test = require('node:test');
const assert = require('node:assert');
const createApp = require('../server');
const open = require('../db');
const { validate, normUrl } = require('../public/js/validate');

const good = () => ({
  title: 'Group Chat Chaos', creatorName: 'Priya', description: 'Allegedly.', link: 'instagram.com/priyamakes', tags: ['food'],
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
  assert.equal(r.value.link, 'https://instagram.com/priyamakes');
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
  assert.deepEqual(fields(validate({ ...good(), link: 'javascript:alert(1)' })), ['link']);
});

test('validate: missing basics, topics, and garbage input', () => {
  assert.deepEqual(fields(validate({ ...good(), title: '', creatorName: '' })), ['creatorName', 'title']);
  assert.deepEqual(fields(validate({ ...good(), tags: ['food', 'nope'] })), ['tags']);
  assert.deepEqual(fields(validate({ ...good(), tags: ['food', 'sport', 'music', 'gaming'] })), ['tags']);
  assert.ok(!validate(null).ok);
  assert.ok(!validate({ groups: 'x' }).ok);
  assert.equal(validate({ ...good(), title: 'a\u0000b\n  c' }).value.title, 'a b c', 'control chars and runs of space collapse');
});

// ---------- API ----------
const serve = async (t, db = open(':memory:')) => {
  const srv = createApp(db).listen(0);
  t.after(() => srv.close());
  const url = `http://127.0.0.1:${srv.address().port}`;
  const call = (method, path, body, cookie) => fetch(url + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { url, call, db };
};
const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];

test('publish: creates a playable puzzle credited to the creator, owner cookie set', async (t) => {
  const { call, url } = await serve(t);
  const res = await call('POST', '/api/puzzles', good());
  assert.equal(res.status, 201);
  const { id, url: path } = await res.json();
  assert.match(id, /^[0-9a-zA-Z]{8}$/);
  assert.equal(path, `/p/${id}`);
  const sc = res.headers.get('set-cookie');
  assert.match(sc, /qs_owner=/);
  assert.match(sc, /HttpOnly/i);

  const html = await (await fetch(url + path)).text();
  assert.match(html, /<strong>Priya<\/strong>/);
  assert.match(html, /href="https:\/\/instagram\.com\/priyamakes"/);
  assert.match(html, /data-w="Halloumi"/);
  assert.doesNotMatch(html, /Things that squeak/, 'answers still hidden');

  const check = await (await call('POST', '/api/plays/check', { puzzleId: id, words: ['Brie', 'Feta', 'Edam', 'Halloumi'] })).json();
  assert.equal(check.result, 'correct');
});

test('publish: invalid puzzles are refused with field errors; bad bodies do not crash', async (t) => {
  const { call } = await serve(t);
  const p = good(); p.groups[0].words[0] = '';
  const res = await call('POST', '/api/puzzles', p);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).errors[0].field, 'g0.w0');
  assert.equal((await call('POST', '/api/puzzles', undefined)).status, 400);
  assert.equal((await fetch(res.url, { method: 'POST' })).status, 400, 'no JSON content-type at all');
  assert.equal((await fetch(res.url.replace('/puzzles', '/plays/check'), { method: 'POST' })).status, 404);
});

test('edit: only the owner; changing groups clears plays, changing text does not', async (t) => {
  const { call, url, db } = await serve(t);
  const created = await call('POST', '/api/puzzles', good());
  const cookie = cookieOf(created);
  const { id } = await created.json();
  db.prepare("INSERT INTO plays (puzzle_id, player_key, won, mistakes, guesses_json) VALUES (?, 'someone-1', 1, 0, '[]')").run(id);

  assert.equal((await fetch(`${url}/p/${id}/edit`)).status, 404, 'no cookie, no editor');
  assert.equal((await fetch(`${url}/p/${id}/edit`, { headers: { cookie: 'qs_owner=' + 'x'.repeat(32) } })).status, 404);
  assert.equal((await call('PUT', `/api/puzzles/${id}`, good(), 'qs_owner=' + 'x'.repeat(32))).status, 404);

  const page = await fetch(`${url}/p/${id}/edit`, { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /value="Group Chat Chaos"/);

  const retitle = { ...good(), title: 'Renamed' };
  const r1 = await (await call('PUT', `/api/puzzles/${id}`, retitle, cookie)).json();
  assert.equal(r1.statsReset, false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM plays').get().n, 1);
  assert.equal(db.prepare('SELECT title FROM puzzles WHERE id = ?').get(id).title, 'Renamed');

  const regroup = good(); regroup.groups[0].words[0] = 'Cheddar';
  const r2 = await (await call('PUT', `/api/puzzles/${id}`, regroup, cookie)).json();
  assert.equal(r2.statsReset, true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM plays').get().n, 0);
});

test('create page renders; saved play progress is tied to the words (rev)', async (t) => {
  const { call, url } = await serve(t);
  const html = await (await fetch(url + '/create')).text();
  assert.match(html, /Make a puzzle/);
  assert.match(html, /Publish puzzle/);
  const a = await (await call('POST', '/api/puzzles', good())).json();
  const g2 = good(); g2.groups[0].words[0] = 'Cheddar';
  const b = await (await call('POST', '/api/puzzles', g2)).json();
  const rev = async (id) => /data-rev="(\w+)"/.exec(await (await fetch(`${url}/p/${id}`)).text())[1];
  assert.notEqual(await rev(a.id), await rev(b.id));
});
