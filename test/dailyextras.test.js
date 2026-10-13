const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { serve, good, resend, until } = require('./helpers');
const open = require('../db');
const { etDay } = require('../lib/daily');

const at = (iso) => Date.parse(iso);

async function world(t, { onPick } = { onPick: () => {} }) {
  let now = at('2026-10-13T16:00:00Z');
  const db = open(':memory:');
  const s = await serve(t, db, { now: () => now, ...(onPick ? { onPick } : {}) });
  const boss = s.person(); await boss.signup({ username: 'boss', email: 'b@x.com', display_name: 'Boss' });
  db.prepare("UPDATE users SET is_admin = 1 WHERE username = 'boss'").run();
  const maker = s.person(); await maker.signup({ username: 'maker', email: 'm@x.com', display_name: 'Maker' });
  const mk = async (who, title, o = {}) => (await (await who.post('/api/puzzles', { ...good(), title, ...o })).json()).id;
  return { ...s, boss, maker, anon: s.person(), mk, advance: (d) => { now += d * 86400000; } };
}

test('the landing page shows today\'s Daily and the nav links to it', async (t) => {
  const { anon, maker, mk } = await world(t);
  await mk(maker, 'Landing Star', { daily: true });
  const html = await (await anon.get('/')).text();
  assert.match(html, /Today's Daily · #1 · Tuesday, October 13/);
  assert.match(html, /<h2>Landing Star<\/h2>/);
  assert.match(html, /<a class="daily-card" href="\/daily">/);
  assert.match(html, /<a class="nav-daily" href="\/daily">Daily<\/a>/);
  assert.match(html, /<a href="\/daily">Daily<\/a>/, 'and the footer');
  assert.doesNotMatch(html, /Cheeses|Hiding an animal/);
});

test('admin: the line, tomorrow\'s pick, jumping the line, removing', async (t) => {
  const { boss, maker, anon, mk, advance, db } = await world(t);
  const first = await mk(maker, 'First In Line', { daily: true });
  const other = await mk(boss, 'Second In Line', { daily: true });
  const third = await mk(maker, 'Third In Line', { daily: true });
  db.prepare('UPDATE puzzles SET daily_opt_in_at = 100 WHERE id = ?').run(first);
  db.prepare('UPDATE puzzles SET daily_opt_in_at = 200 WHERE id = ?').run(other);
  db.prepare('UPDATE puzzles SET daily_opt_in_at = 300 WHERE id = ?').run(third);

  assert.equal((await maker.get('/admin?tab=daily')).status, 404);
  let html = await (await boss.get('/admin?tab=daily')).text();
  assert.match(html, /Today, Daily #1<\/b> · <a class="qtitle" href="\/p\/[^"]+">First In Line/);
  assert.match(html, /Tomorrow:<\/b> not picked yet/);
  const order = [...html.matchAll(/class="qtitle" href="\/p\/\w+">(\d)\. (\w+ \w+ \w+)/g)].map((m) => `${m[1]}.${m[2]}`);
  assert.deepEqual(order, ['1.Second In Line', '2.Third In Line'], 'today\'s pick has left the line');

  const jump = await boss.form(`/admin/puzzles/${third}`, { action: 'tomorrow', back: '/admin?tab=daily' });
  assert.equal(jump.headers.get('location'), '/admin?tab=daily');
  html = await (await boss.get('/admin?tab=daily')).text();
  assert.match(html, /Tomorrow:<\/b> Daily #2 · Third In Line/);

  await boss.form(`/admin/puzzles/${other}`, { action: 'unqueue', back: '/admin?tab=daily' });
  assert.doesNotMatch(await (await boss.get('/admin?tab=daily')).text(), /Second In Line<\/a>/);

  advance(1);
  assert.match(await (await anon.get('/daily')).text(), /<h1>Third In Line<\/h1>/, 'the jump took effect when the day turned');

  db.prepare('UPDATE puzzles SET is_flagged = 1 WHERE id = ?').run(first);
  const none = await maker.form(`/admin/puzzles/${first}`, { action: 'tomorrow' });
  assert.equal(none.status, 404, 'non-admins can do nothing here');
});

test('creators get one email when their puzzle is picked; house puzzles send nothing', async (t) => {
  const sent = resend(t);
  const { anon, maker, mk, advance } = await world(t, { onPick: undefined });   // the real notifier
  const id = await mk(maker, 'Email Me', { daily: true });
  await anon.get('/daily');
  assert.ok(await until(() => sent.length === 1));
  const mail = sent[0].body;
  assert.deepEqual(mail.to, ['m@x.com']);
  assert.equal(mail.subject, 'Your puzzle is the Daily on Tuesday, October 13');
  assert.match(mail.text, /"Email Me" is Quadsort Daily #1 on Tuesday, October 13/);
  assert.match(mail.text, new RegExp(`/p/${id}`));
  assert.match(mail.html, /You're the Daily\./);
  await anon.get('/daily'); await anon.get('/');
  advance(1);
  await anon.get('/daily');                                // a house puzzle fills in tomorrow
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(sent.length, 1, 'no repeat, and nothing for a puzzle with no creator');
});

test('scripts/pick-daily.js picks, is repeatable, and says what it did', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-'));
  const file = path.join(dir, 't.db');
  const db = open(file);
  db.prepare("INSERT INTO users (id, username, email, password_hash, display_name) VALUES (1,'ann','a@x.com','x','Ann')").run();
  db.prepare("INSERT INTO puzzles (id, user_id, title, groups_json, daily_opt_in_at) VALUES ('annpuzzl', 1, 'Ann Puzzle', '[]', 100)").run();
  db.close();
  const run = () => spawnSync(process.execPath, [path.join(__dirname, '../scripts/pick-daily.js')], { env: { ...process.env, DB_PATH: file, RESEND_API_KEY: '', NODE_ENV: 'test' }, encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, new RegExp(`Daily #1 for ${etDay(Date.now())}: annpuzzl`));
  assert.match(first.stdout, /Your puzzle is the Daily/, 'the creator email (printed, since no key is set)');
  const second = run();
  assert.match(second.stdout, /Daily #1 for .*annpuzzl/);
  assert.doesNotMatch(second.stdout, /mail, not sent/, 'no second email');
  assert.equal(open(file).prepare('SELECT COUNT(*) n FROM dailies').get().n, 1);
  fs.rmSync(dir, { recursive: true });
});
