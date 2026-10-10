const test = require('node:test');
const assert = require('node:assert');
const createApp = require('../server');
const open = require('../db');

test('migrations create the schema', () => {
  const db = open(':memory:');
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const n of ['users', 'puzzles', 'plays', 'sessions']) assert.ok(t.includes(n), n);
});

test('home, health and 404', async (t) => {
  const srv = createApp(open(':memory:')).listen(0);
  t.after(() => srv.close());
  const url = `http://127.0.0.1:${srv.address().port}`;
  const home = await fetch(url + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Make a puzzle/);
  assert.equal(await (await fetch(url + '/healthz')).text(), 'ok');
  assert.equal((await fetch(url + '/nope')).status, 404);
  assert.equal((await fetch(url + '/css/site.css')).status, 200);
});

const serve = async (t, db = open(':memory:')) => {
  const srv = createApp(db).listen(0);
  t.after(() => srv.close());
  const url = `http://127.0.0.1:${srv.address().port}`;
  const post = (p, body) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { url, post, db };
};
const CHEESE = ['Brie', 'Feta', 'Edam', 'Halloumi'];
const BOARD = ['Surf', 'Key', 'Cup', 'Skate'];
const SQUEAK = ['Mouse', 'Trainers', 'Door', 'Swing'];
const ANIMAL = ['Catastrophe', 'Pigment', 'Battery', 'Rational'];

test('play page lists the words but never the answers', async (t) => {
  const { url } = await serve(t);
  const html = await (await fetch(url + '/p/demo0001')).text();
  assert.match(html, /data-w="Halloumi"/);
  assert.doesNotMatch(html, /Cheeses|Hiding an animal|Things that squeak/);
  assert.equal((await fetch(url + '/p/nope')).status, 404);
});

test('random puzzle redirects to a puzzle', async (t) => {
  const { url } = await serve(t);
  const r = await fetch(url + '/random', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/p/demo0001');
});

test('check endpoint', async (t) => {
  const { post } = await serve(t);
  const ok = await (await post('/api/plays/check', { puzzleId: 'demo0001', words: CHEESE })).json();
  assert.equal(ok.result, 'correct');
  assert.equal(ok.group.name, 'Cheeses');
  const one = await (await post('/api/plays/check', { puzzleId: 'demo0001', words: ['Brie', 'Feta', 'Edam', 'Surf'] })).json();
  assert.deepEqual(one, { result: 'one_away' });
  assert.equal((await post('/api/plays/check', { puzzleId: 'demo0001', words: ['x', 'y', 'z', 'w'] })).status, 400);
  assert.equal((await post('/api/plays/check', { puzzleId: 'nope', words: CHEESE })).status, 404);
});

test('finished game is verified, logged once, and reveals the solution', async (t) => {
  const { post, db } = await serve(t);
  const fake = await post('/api/plays', { puzzleId: 'demo0001', playerKey: 'player-key-1', guesses: [['Brie', 'Feta', 'Edam', 'Surf']] });
  assert.equal(fake.status, 400, 'cannot claim a loss to see the answers');

  const lost = [['Brie', 'Feta', 'Surf', 'Key'], ['Brie', 'Feta', 'Mouse', 'Door'], ['Brie', 'Feta', 'Pigment', 'Rational'], ['Surf', 'Key', 'Mouse', 'Door']];
  const res = await post('/api/plays', { puzzleId: 'demo0001', playerKey: 'player-key-1', guesses: lost });
  const body = await res.json();
  assert.equal(body.won, false);
  assert.equal(body.solution.length, 4);
  assert.equal(body.solution[0].name, 'Cheeses');

  await post('/api/plays', { puzzleId: 'demo0001', playerKey: 'player-key-1', guesses: lost });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM plays').get().n, 1, 'same player is counted once');

  const won = await (await post('/api/plays', { puzzleId: 'demo0001', playerKey: 'player-key-2', guesses: [CHEESE, BOARD, SQUEAK, ANIMAL] })).json();
  assert.deepEqual([won.won, won.mistakes], [true, 0]);
});

test('creator byline renders, and only http(s) social links become links', async (t) => {
  const db = open(':memory:');
  db.prepare("INSERT INTO users (id, username, email, password_hash, display_name, social_url) VALUES (1,'priya','p@x.com','x','Priya Makes Puzzles','javascript:alert(1)')").run();
  db.prepare("UPDATE puzzles SET user_id = 1 WHERE id = 'demo0001'").run();
  const { url } = await serve(t, db);
  const html = await (await fetch(url + '/p/demo0001')).text();
  assert.match(html, /href="\/u\/priya">Priya Makes Puzzles/);
  assert.doesNotMatch(html, /javascript:/);
});
