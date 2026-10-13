const test = require('node:test');
const assert = require('node:assert');
const { serve, good } = require('./helpers');
const open = require('../db');

async function site(t) {
  let now = Date.parse('2026-10-13T16:00:00Z');
  const s = await serve(t, open(':memory:'), { now: () => now, onPick: () => {} });
  const me = s.person(); await me.signup();
  return { ...s, me, anon: s.person(), advance: (d) => { now += d * 86400000; } };
}
const publish = async (who, o = {}) => (await who.post('/api/puzzles', { ...good(), ...o })).json();
const state = (db, id) => db.prepare('SELECT daily_opt_in_at a FROM puzzles WHERE id = ?').get(id).a;

test('ticking the box at publish puts a puzzle in line; leaving it unticked does not', async (t) => {
  const { me, db } = await site(t);
  const yes = await publish(me, { daily: true }), no = await publish(me);
  assert.equal(yes.daily.state, 'queued');
  assert.equal(yes.daily.position, 1);
  assert.equal(no.daily.state, 'none');
  assert.ok(state(db, yes.id) > 0);
  assert.equal(state(db, no.id), null);
  const second = await publish(me, { daily: true });
  assert.equal(second.daily.position, 2, 'first come, first served');
});

test('while a puzzle waits in line its words are locked; the title is not', async (t) => {
  const { me, db } = await site(t);
  const { id } = await publish(me, { daily: true });
  const was = state(db, id);

  const retitle = await me.put(`/api/puzzles/${id}`, { ...good(), title: 'New title', daily: true });
  assert.equal(retitle.status, 200);
  assert.equal(state(db, id), was, 'a title change does not cost you your place');

  const reword = good(); reword.groups[0].words[0] = 'Cheddar';
  for (const daily of [true, undefined]) {
    const blocked = await me.put(`/api/puzzles/${id}`, { ...reword, daily });
    assert.equal(blocked.status, 409);
    assert.match((await blocked.json()).error, /locked while this is in line/);
  }
  const free = await me.put(`/api/puzzles/${id}`, { ...reword, daily: false });
  assert.equal(free.status, 200, 'unticking the box unlocks the words');
  assert.equal(state(db, id), null);
  assert.equal((await free.json()).daily.state, 'none');
  const back = await (await me.put(`/api/puzzles/${id}`, { ...reword, daily: true })).json();
  assert.equal(back.daily.state, 'queued');
});

test('a puzzle that has been the Daily keeps its words forever, and cannot be deleted', async (t) => {
  const { me, anon, db } = await site(t);
  const { id } = await publish(me, { daily: true });
  await anon.get('/daily');                                   // it runs today
  assert.equal((await me.put(`/api/puzzles/${id}`, { ...good(), title: 'Still editable' })).status, 200);

  const reword = good(); reword.groups[0].words[0] = 'Cheddar';
  const blocked = await me.put(`/api/puzzles/${id}`, { ...reword, daily: false });
  assert.equal(blocked.status, 409);
  assert.match((await blocked.json()).error, /words are locked/);

  const del = await me.del(`/api/puzzles/${id}`);
  assert.equal(del.status, 409);
  assert.match((await del.json()).error, /stays in the archive/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM puzzles WHERE id = ?').get(id).n, 1);

  const rejoin = await me.post(`/api/puzzles/${id}/daily`, { in: true });
  assert.equal(rejoin.status, 409, 'one Daily per puzzle');
});

test('join and leave from the dashboard: owners only', async (t) => {
  const { me, anon, person, db } = await site(t);
  const { id } = await publish(me);
  const stranger = person(); await stranger.signup({ username: 'sam', email: 's@x.com', display_name: 'Sam' });

  assert.equal((await anon.post(`/api/puzzles/${id}/daily`, { in: true })).status, 401);
  assert.equal((await stranger.post(`/api/puzzles/${id}/daily`, { in: true })).status, 404);
  assert.equal(state(db, id), null);

  const joined = await (await me.post(`/api/puzzles/${id}/daily`, { in: true })).json();
  assert.equal(joined.daily.state, 'queued');
  const left = await (await me.post(`/api/puzzles/${id}/daily`, { in: false })).json();
  assert.equal(left.daily.state, 'none');
});

test('puzzles still waiting can be deleted, and they leave the line', async (t) => {
  const { me, db } = await site(t);
  const { id } = await publish(me, { daily: true });
  assert.equal((await me.del(`/api/puzzles/${id}`)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM puzzles WHERE id = ?').get(id).n, 0);
});

test('the dashboard and editor say where each puzzle stands, and offer the right buttons', async (t) => {
  const { me, anon, advance } = await site(t);
  const a = await publish(me, { daily: true, title: 'Waiting Puzzle' });
  const b = await publish(me, { title: 'Quiet Puzzle' });
  let dash = await (await me.get('/dashboard')).text();
  assert.match(dash, /In line for the Daily\. It runs today\./);
  assert.match(dash, new RegExp(`data-daily="leave" data-id="${a.id}"`));
  assert.match(dash, new RegExp(`data-daily="join" data-id="${b.id}"`));

  await anon.get('/daily');                         // Waiting Puzzle runs today
  advance(1);
  dash = await (await me.get('/dashboard')).text();
  assert.match(dash, /Was Daily #1 on Oct 13\./);
  assert.doesNotMatch(dash, new RegExp(`data-delete="${a.id}"`), 'a Daily has no delete button');
  assert.match(dash, new RegExp(`data-delete="${b.id}"`));

  const edit = await (await me.get(`/p/${a.id}/edit`)).text();
  assert.match(edit, /Was Daily #1 on Oct 13\. Its words are locked for good/);
  assert.doesNotMatch(edit, /id="daily-opt"/, 'no checkbox once it has run');
  assert.match(edit, /data-daily="was"/);
  const fresh = await (await me.get(`/p/${b.id}/edit`)).text();
  assert.match(fresh, /id="daily-opt">/);
  assert.match(await (await me.get('/create')).text(), /Put this in the Daily rotation\./);
});
