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
