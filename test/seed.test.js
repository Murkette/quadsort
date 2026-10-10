const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const open = require('../db');
const { PUZZLES, check } = require('../scripts/seed-puzzles');

test('every house puzzle passes the site validator, with unique ids and no word reused inside a puzzle', () => {
  assert.deepEqual(check(), []);
  assert.equal(new Set(PUZZLES.map((p) => p.id)).size, PUZZLES.length);
  for (const p of PUZZLES) {
    assert.deepEqual(p.groups.map((g) => g.level), [1, 2, 3, 4], p.id);
    assert.equal(new Set(p.groups.flatMap((g) => g.words.map((w) => w.toLowerCase()))).size, 16, p.id);
  }
});

test('seeding is idempotent and refreshes the demo puzzle', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-'));
  const file = path.join(dir, 't.db');
  open(file).close();
  const run = () => spawnSync(process.execPath, [path.join(__dirname, '../scripts/seed-puzzles.js')], { env: { ...process.env, DB_PATH: file }, encoding: 'utf8' });
  assert.equal(run().status, 0);
  assert.equal(run().status, 0, 'second run is harmless');
  const db = open(file);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM puzzles').get().n, PUZZLES.length);
  assert.match(db.prepare("SELECT groups_json g FROM puzzles WHERE id = 'demo0001'").get().g, /Sneakers/);
  assert.doesNotMatch(db.prepare("SELECT groups_json g FROM puzzles WHERE id = 'demo0001'").get().g, /Trainers|Halloumi/);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM puzzles WHERE is_featured = 1').get().n >= 4, 'landing page gets staff picks');
  fs.rmSync(dir, { recursive: true });
});
