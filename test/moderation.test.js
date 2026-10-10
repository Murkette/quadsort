const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { serve, good } = require('./helpers');
const open = require('../db');

// Creator "priya" with one puzzle, a signed-up admin "boss", and a stranger.
async function world(t) {
  const s = await serve(t);
  const priya = s.person(); await priya.signup();
  const { id } = await (await priya.post('/api/puzzles', { ...good(), title: 'Moderation Target' })).json();
  const boss = s.person(); await boss.signup({ username: 'boss', email: 'b@x.com', display_name: 'Boss' });
  s.db.prepare("UPDATE users SET is_admin = 1 WHERE username = 'boss'").run();
  return { ...s, priya, boss, id, anon: s.person() };
}
const report = (anon, id, o = {}) => anon.post(`/api/puzzles/${id}/report`, { reason: 'offensive', note: 'rude', playerKey: 'player-key-1', ...o });
const adminPost = (who, id, action, back) => who.form(`/admin/puzzles/${id}`, { action, ...(back ? { back } : {}) });

test('reporting: one per player, validated, never for hidden or missing puzzles', async (t) => {
  const { anon, id, db } = await world(t);
  assert.equal((await report(anon, id)).status, 200);
  assert.equal((await report(anon, id, { reason: 'spam', note: 'again' })).status, 200, 'repeat is accepted quietly');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM reports').get().n, 1, '...but only counted once');
  assert.equal((await report(anon, id, { playerKey: 'player-key-2' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM reports').get().n, 2);

  assert.equal((await report(anon, id, { reason: 'because' })).status, 400);
  assert.equal((await report(anon, id, { reason: 'toString' })).status, 400, 'prototype keys are not reasons');
  assert.equal((await report(anon, id, { playerKey: 'short' })).status, 400);
  assert.equal((await report(anon, 'nope0000')).status, 404);
  assert.equal((await anon.post(`/api/puzzles/${id}/report`, undefined)).status, 400);
  await report(anon, id, { playerKey: 'player-key-3', note: 'x'.repeat(500) });
  assert.equal(db.prepare("SELECT LENGTH(note) n FROM reports WHERE reporter_key = 'player-key-3'").get().n, 200);

  db.prepare('UPDATE puzzles SET is_flagged = 1').run();
  assert.equal((await report(anon, id, { playerKey: 'player-key-9' })).status, 404);
});

test('the play page offers a report button', async (t) => {
  const { anon, id } = await world(t);
  const html = await (await anon.get(`/p/${id}`)).text();
  assert.match(html, /id="report-open"/);
  assert.match(html, /<option value="offensive">Offensive or hateful<\/option>/);
  assert.match(html, /src="\/js\/report\.js"/);
});

test('admin area: sign in to see it, 404 for everyone who is not an admin', async (t) => {
  const { anon, priya, boss, id } = await world(t);
  const bounce = await anon.get('/admin');
  assert.equal(bounce.status, 302);
  assert.match(bounce.headers.get('location'), /^\/login\?next=%2Fadmin/);
  assert.equal((await priya.get('/admin')).status, 404);
  assert.equal((await priya.get('/admin?tab=puzzles')).status, 404);
  assert.equal((await priya.form(`/admin/puzzles/${id}`, { action: 'hide' })).status, 404);
  assert.equal((await boss.get('/admin')).status, 200);
  assert.equal((await boss.get('/admin?tab=puzzles')).status, 200);
});

test('non-admins cannot change anything', async (t) => {
  const { priya, anon, id, db } = await world(t);
  await adminPost(priya, id, 'hide');
  await adminPost(anon, id, 'feature');
  const p = db.prepare('SELECT is_flagged, is_featured FROM puzzles WHERE id = ?').get(id);
  assert.deepEqual({ ...p }, { is_flagged: 0, is_featured: 0 });
});

test('reports queue: counts, reasons and notes, with notes escaped', async (t) => {
  const { anon, boss, id } = await world(t);
  assert.match(await (await boss.get('/admin')).text(), /All clear/);
  await report(anon, id, { playerKey: 'k-offensive-1', reason: 'offensive', note: '<script>alert(1)</script>' });
  await report(anon, id, { playerKey: 'k-offensive-2', reason: 'offensive', note: '' });
  await report(anon, id, { playerKey: 'k-spam-000001', reason: 'spam', note: 'buy now' });
  const html = await (await boss.get('/admin')).text();
  assert.match(html, /Moderation Target/);
  assert.match(html, /3 reports/);
  assert.match(html, /Offensive or hateful × 2/);
  assert.match(html, /Spam or a scam × 1/);
  assert.match(html, /buy now/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, />Reports \(1\)</);
});

test('hide: gone for the public, visible to owner and admin, reports closed, reversible', async (t) => {
  const { anon, priya, boss, id, db } = await world(t);
  await adminPost(boss, id, 'feature');
  await report(anon, id);
  assert.equal(db.prepare('SELECT is_featured f FROM puzzles').get().f, 1);

  const r = await adminPost(boss, id, 'hide');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/admin');
  assert.deepEqual({ ...db.prepare('SELECT is_flagged, is_featured FROM puzzles WHERE id = ?').get(id) }, { is_flagged: 1, is_featured: 0 }, 'hiding also removes the staff pick');
  assert.equal(db.prepare('SELECT resolved r FROM reports').get().r, 1);

  assert.equal((await anon.get(`/p/${id}`)).status, 404);
  assert.doesNotMatch(await (await anon.get('/browse')).text(), /Moderation Target/);
  assert.doesNotMatch(await (await anon.get('/u/priya')).text(), /Moderation Target/);
  const owner = await priya.get(`/p/${id}`);
  assert.equal(owner.status, 200);
  assert.match(await owner.text(), /hidden by a moderator/);
  assert.equal((await boss.get(`/p/${id}`)).status, 200);
  assert.match(await (await priya.get('/dashboard')).text(), /Hidden by moderators/);

  assert.doesNotMatch(await (await boss.get('/admin?tab=puzzles')).text(), /Make staff pick/, 'a hidden puzzle can not be made a pick');
  await adminPost(boss, id, 'unhide');
  assert.equal((await anon.get(`/p/${id}`)).status, 200);
  assert.doesNotMatch(await (await anon.get(`/p/${id}`)).text(), /hidden by a moderator/);
});

test('staff picks appear on the landing page and can be removed', async (t) => {
  const { anon, boss, id, db } = await world(t);
  db.prepare("UPDATE puzzles SET is_featured = 0").run();
  assert.doesNotMatch(await (await anon.get('/')).text(), /Staff picks/);
  await adminPost(boss, id, 'feature');
  let html = await (await anon.get('/')).text();
  assert.match(html, /Staff picks\./);
  assert.match(html, /Moderation Target/);
  assert.match(html, /Staff pick/);
  await adminPost(boss, id, 'unfeature');
  assert.doesNotMatch(await (await anon.get('/')).text(), /Staff picks\./);
  db.prepare("UPDATE puzzles SET is_flagged = 1 WHERE id = ?").run(id);
  await adminPost(boss, id, 'feature');
  assert.equal(db.prepare('SELECT is_featured f FROM puzzles WHERE id = ?').get(id).f, 0, 'hidden puzzles stay out of staff picks');
});

test('dismiss closes the reports and leaves the puzzle up', async (t) => {
  const { anon, boss, id } = await world(t);
  await report(anon, id);
  await adminPost(boss, id, 'dismiss');
  assert.match(await (await boss.get('/admin')).text(), /All clear/);
  assert.equal((await anon.get(`/p/${id}`)).status, 200);
});

test('puzzle list: search, junk actions, and a "back" that cannot leave the site', async (t) => {
  const { boss, id } = await world(t);
  let html = await (await boss.get('/admin?tab=puzzles&q=moderation')).text();
  assert.match(html, /1 puzzle for “moderation”/);
  assert.match(html, /Make staff pick/);
  html = await (await boss.get('/admin?tab=puzzles&q=zzzz')).text();
  assert.match(html, /0 puzzles for “zzzz”/);
  assert.equal((await adminPost(boss, id, 'delete everything')).status, 404);
  assert.equal((await adminPost(boss, id, 'constructor')).status, 404);
  assert.equal((await adminPost(boss, 'missing00', 'hide')).status, 404);
  const r = await adminPost(boss, id, 'feature', 'https://evil.com');
  assert.equal(r.headers.get('location'), '/admin');
  const r2 = await adminPost(boss, id, 'unfeature', '/admin?tab=puzzles&q=moderation');
  assert.equal(r2.headers.get('location'), '/admin?tab=puzzles&q=moderation');
});

test('make-admin script', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-'));
  const file = path.join(dir, 't.db');
  const db = open(file);
  db.prepare("INSERT INTO users (username, email, password_hash, display_name) VALUES ('priya','p@x.com','x','Priya')").run();
  db.close();
  const run = (...args) => spawnSync(process.execPath, [path.join(__dirname, '../scripts/make-admin.js'), ...args], { env: { ...process.env, DB_PATH: file }, encoding: 'utf8' });
  const admin = () => open(file).prepare("SELECT is_admin a FROM users WHERE username = 'priya'").get().a;

  assert.equal(run('PRIYA').status, 0);
  assert.equal(admin(), 1);
  assert.equal(run('priya', '--remove').status, 0);
  assert.equal(admin(), 0);
  assert.equal(run('nobody').status, 1);
  assert.equal(run().status, 2);
  fs.rmSync(dir, { recursive: true });
});
