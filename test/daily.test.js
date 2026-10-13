const test = require('node:test');
const assert = require('node:assert');
const open = require('../db');
const { makeDaily, etDay, addDays, validDay } = require('../lib/daily');

const GROUPS = '[{"name":"A","level":1,"words":["a","b","c","d"]}]';
const at = (iso) => Date.parse(iso);

// An in-memory site with a controllable clock. The migration's demo puzzle is the one house puzzle.
function world(start = '2026-10-13T16:00:00Z', opts = {}) {
  const db = open(':memory:');
  let t = at(start);
  const daily = makeDaily(db, { now: () => t, ...opts });
  db.prepare("INSERT INTO users (id, username, email, password_hash, display_name) VALUES (1,'ann','a@x.com','x','Ann'),(2,'bob','b@x.com','x','Bob'),(3,'cy','c@x.com','x','Cy')").run();
  const mk = db.prepare('INSERT INTO puzzles (id, user_id, title, groups_json, daily_opt_in_at, is_flagged, is_published) VALUES (?,?,?,?,?,?,?)');
  return {
    db, daily,
    advance: (days) => { t += days * 86400000; },
    set: (iso) => { t = at(iso); },
    puzzle: (id, user, o = {}) => mk.run(id, user, id.toUpperCase(), GROUPS, o.at ?? null, o.flagged ?? 0, o.published ?? 1),
  };
}
const seq = (w, n) => { const out = []; for (let i = 0; i < n; i++) { out.push(w.daily.current().puzzleId); w.advance(1); } return out; };

test('the day turns over at midnight Eastern, in summer and in winter', () => {
  assert.equal(etDay(at('2026-10-13T03:59:59Z')), '2026-10-12');
  assert.equal(etDay(at('2026-10-13T04:00:00Z')), '2026-10-13');   // EDT: UTC-4
  assert.equal(etDay(at('2026-12-01T04:59:59Z')), '2026-11-30');
  assert.equal(etDay(at('2026-12-01T05:00:00Z')), '2026-12-01');   // EST: UTC-5
  assert.equal(etDay(at('2026-11-02T04:59:59Z')), '2026-11-01');   // the night the clocks go back
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.ok(validDay('2026-10-13') && !validDay('2026-02-31') && !validDay('13-10-2026') && !validDay(undefined));
});

test('an empty line falls back to a house puzzle, and today is the same puzzle for everyone', () => {
  const w = world();
  const a = w.daily.current(), b = w.daily.current();
  assert.equal(a.puzzleId, 'demo0001');
  assert.equal(a.number, 1);
  assert.deepEqual(a, b);
  assert.equal(w.db.prepare('SELECT COUNT(*) n FROM dailies').get().n, 1);
  assert.equal(a.label, 'Tuesday, October 13');
  assert.ok(a.isToday);
});

test('the line is first in, first out', () => {
  const w = world();
  w.puzzle('third', 1, { at: 300 }); w.puzzle('first', 2, { at: 100 }); w.puzzle('second', 3, { at: 200 });
  assert.deepEqual(seq(w, 3), ['first', 'second', 'third']);
});

test('one creator cannot hold two Dailies within a week; their place in line is kept', () => {
  const w = world();
  w.puzzle('ann1', 1, { at: 100 }); w.puzzle('ann2', 1, { at: 101 }); w.puzzle('bob1', 2, { at: 102 });
  const days = seq(w, 9);
  assert.equal(days[0], 'ann1');
  assert.equal(days[1], 'bob1', 'ann2 is next in line but ann just ran, so bob goes');
  assert.deepEqual(days.slice(2, 7), Array(5).fill('demo0001'), 'with nobody eligible the house fills in');
  assert.equal(days[7], 'ann2', 'seven days after ann1, ann2 runs ahead of anyone newer');
});

test('a puzzle is a Daily once, and the numbers count up', () => {
  const w = world();
  w.puzzle('only', 1, { at: 100 });
  w.daily.current(); w.advance(1);
  const next = w.daily.current();
  assert.equal(next.puzzleId, 'demo0001');
  assert.deepEqual(w.db.prepare('SELECT number FROM dailies ORDER BY day').all().map((r) => r.number), [1, 2]);
  assert.equal(w.daily.queue().length, 0, 'it left the line after running');
});

test('hidden and unpublished puzzles are never picked', () => {
  const w = world();
  w.puzzle('hidden', 1, { at: 100, flagged: 1 }); w.puzzle('draft', 2, { at: 101, published: 0 }); w.puzzle('good', 3, { at: 102 });
  assert.equal(w.daily.queue().length, 1);
  assert.equal(w.daily.current().puzzleId, 'good');
});

test('if a moderator hides today\'s Daily, another takes its place under the same number', () => {
  const w = world();
  w.puzzle('bad', 1, { at: 100 }); w.puzzle('next', 2, { at: 101 });
  const d = w.daily.current();
  assert.equal(d.puzzleId, 'bad');
  w.db.prepare("UPDATE puzzles SET is_flagged = 1 WHERE id = 'bad'").run();
  const after = w.daily.current();
  assert.equal(after.puzzleId, 'next');
  assert.equal(after.number, d.number);
  assert.equal(w.db.prepare('SELECT COUNT(*) n FROM dailies').get().n, 1);
});

test('the same day is only ever written once', () => {
  const w = world();
  w.puzzle('p1', 1, { at: 100 }); w.puzzle('p2', 2, { at: 101 });
  const first = w.daily.pick('2026-10-13');
  const again = w.daily.pick('2026-10-13');
  assert.deepEqual(first, again);
  assert.equal(w.db.prepare('SELECT COUNT(*) n FROM dailies').get().n, 1);
});

test('past days can be looked up; future and nonsense days cannot', () => {
  const w = world();
  w.daily.current(); w.advance(1); w.daily.current();
  assert.equal(w.daily.forDay('2026-10-13').number, 1);
  assert.equal(w.daily.forDay('2026-10-14').number, 2);
  assert.equal(w.daily.forDay('2026-10-15'), null, 'tomorrow is not out yet');
  assert.equal(w.daily.forDay('2026-10-12'), null, 'a day before the first');
  assert.equal(w.daily.forDay('2026-02-31'), null);
  assert.equal(w.daily.forDay('../etc'), null);
});

test('info(): where a puzzle stands', () => {
  const w = world();
  w.puzzle('free', 1); w.puzzle('ahead', 3, { at: 50 }); w.puzzle('wait', 2, { at: 100 });
  assert.deepEqual(w.daily.info('free'), { state: 'none' });
  w.daily.current();                                  // 'ahead' takes today
  const q = w.daily.info('wait');
  assert.deepEqual([q.state, q.position, q.daysAway], ['queued', 1, 1]);
  w.advance(1); w.daily.current();
  const now = w.daily.info('wait');
  assert.deepEqual([now.state, now.number, now.short], ['today', 2, 'Oct 14']);
  w.advance(1);
  assert.equal(w.daily.info('wait').state, 'was');
  w.daily.makeTomorrows('free');
  assert.equal(w.daily.info('free').state, 'scheduled');
});

test('queue() estimates days away, skipping days an admin already filled', () => {
  const w = world();
  w.puzzle('a', 1, { at: 100 }); w.puzzle('b', 2, { at: 101 }); w.puzzle('c', 3, { at: 102 });
  assert.deepEqual(w.daily.queue().map((p) => p.daysAway), [0, 1, 2], 'today is not picked yet, so the first one runs today');
  w.daily.current();
  assert.deepEqual(w.daily.queue().map((p) => [p.id, p.daysAway]), [['b', 1], ['c', 2]]);
  w.puzzle('pushy', 1); w.daily.makeTomorrows('pushy');
  assert.deepEqual(w.daily.queue().map((p) => [p.id, p.daysAway]), [['b', 2], ['c', 3]]);
});

test('join keeps your place, leave removes it, and a puzzle that already ran cannot rejoin', () => {
  const w = world();
  w.puzzle('mine', 1); w.puzzle('early', 2, { at: 5 });
  assert.ok(w.daily.join('mine'));
  const at1 = w.db.prepare("SELECT daily_opt_in_at a FROM puzzles WHERE id = 'mine'").get().a;
  w.db.prepare("UPDATE puzzles SET daily_opt_in_at = 50 WHERE id = 'mine'").run();
  w.daily.join('mine');
  assert.equal(w.db.prepare("SELECT daily_opt_in_at a FROM puzzles WHERE id = 'mine'").get().a, 50, 'joining twice does not lose your spot');
  assert.ok(at1 > 0);
  assert.deepEqual(w.daily.queue().map((p) => p.id), ['early', 'mine']);
  w.daily.leave('mine');
  assert.deepEqual(w.daily.queue().map((p) => p.id), ['early']);
  w.daily.current();                                   // 'early' runs
  assert.equal(w.daily.join('early'), false);
});

test('makeTomorrows jumps the line, replaces an earlier choice, and refuses hidden puzzles', () => {
  const w = world();
  w.puzzle('waiting', 1, { at: 1 }); w.puzzle('vip', 2); w.puzzle('vip2', 3); w.puzzle('hid', 1, { flagged: 1 });
  const today = w.daily.current();
  assert.equal(today.puzzleId, 'waiting');
  const t = w.daily.makeTomorrows('vip');
  assert.deepEqual([t.day, t.number], ['2026-10-14', 2]);
  assert.equal(w.daily.makeTomorrows('vip2').number, 2, 'replacing keeps the number');
  assert.equal(w.daily.makeTomorrows('hid'), null);
  w.advance(1);
  assert.equal(w.daily.current().puzzleId, 'vip2');
});

test('creators are told when they are picked; a notification failure never breaks the pick', async () => {
  const told = [];
  const w = world('2026-10-13T16:00:00Z', { onPick: (d) => { told.push(d); throw new Error('mail is down'); } });
  const realErr = console.error; const errs = []; console.error = (...a) => errs.push(a.join(' '));
  try {
    w.puzzle('mine', 1, { at: 100 });
    assert.equal(w.daily.current().puzzleId, 'mine');
    await new Promise((r) => setTimeout(r, 30));
  } finally { console.error = realErr; }
  assert.deepEqual(told.map((d) => [d.puzzleId, d.userId, d.number, d.day]), [['mine', 1, 1, '2026-10-13']]);
  assert.match(errs.join(), /mail is down/);
  w.daily.current();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(told.length, 1, 'asking again does not re-notify');
});
