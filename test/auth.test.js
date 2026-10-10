const test = require('node:test');
const assert = require('node:assert');
const { serve, good } = require('./helpers');

test('signup logs you in, stores only a hashed password and a hashed session', async (t) => {
  const { person, db } = await serve(t);
  const me = person();
  const res = await me.signup();
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/dashboard');
  assert.match(res.headers.get('set-cookie'), /qs_session=.*HttpOnly/i);

  const u = db.prepare('SELECT * FROM users').get();
  assert.equal(u.email, 'p@x.com');
  assert.ok(!u.password_hash.includes('hunter2'));
  assert.match(u.password_hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  const token = me.cookie.split('=')[1];
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE id = ?').get(token).n, 0, 'raw token is never stored');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1);
  assert.equal((await me.get('/dashboard')).status, 200);
});

test('signup rejects bad and duplicate details, keeping what you typed', async (t) => {
  const { person, db } = await serve(t);
  await person().signup();
  const re = async (o) => { const r = await person().signup(o); return { status: r.status, html: await r.text() }; };

  let r = await re({ email: 'nope', username: 'ab', password: 'short' });
  assert.equal(r.status, 400);
  assert.match(r.html, /doesn&#39;t look like an email/);
  assert.match(r.html, /3 to 24 characters/);
  assert.match(r.html, /At least 8 characters/);
  r = await re({ username: 'PRIYA', email: 'new@x.com' });
  assert.match(r.html, /Taken\. Be more original/, 'usernames are case-insensitive');
  r = await re({ username: 'new', email: 'P@X.COM' });
  assert.match(r.html, /already has an account/, 'emails are case-insensitive');
  assert.match(r.html, /value="new"/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
});

test('login: same message for wrong password and unknown email; next= cannot leave the site', async (t) => {
  const { person } = await serve(t);
  await person().signup();
  const attempt = async (form) => { const r = await person().form('/login', form); return { r, html: await r.text() }; };

  const wrong = await attempt({ email: 'p@x.com', password: 'wrongwrongwrong' });
  const nobody = await attempt({ email: 'nobody@x.com', password: 'wrongwrongwrong' });
  assert.equal(wrong.r.status, 401);
  assert.equal(nobody.r.status, 401);
  assert.match(wrong.html, /Wrong email or password/);
  assert.match(nobody.html, /Wrong email or password/);

  for (const [next, expect] of [['/create', '/create'], ['//evil.com', '/dashboard'], ['https://evil.com', '/dashboard'], ['/\\evil.com', '/dashboard']]) {
    const ok = await attempt({ email: 'P@x.com', password: 'hunter2hunter2', next });
    assert.equal(ok.r.status, 302);
    assert.equal(ok.r.headers.get('location'), expect, next);
  }
});

test('logout ends the session; protected pages bounce to login', async (t) => {
  const { person, db } = await serve(t);
  const me = person(); await me.signup();
  assert.equal((await me.get('/dashboard')).status, 200);
  await me.form('/logout', {});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
  const r = await me.get('/dashboard');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/login?next=%2Fdashboard');
});

test('expired sessions do not log you in', async (t) => {
  const { person, db } = await serve(t);
  const me = person(); await me.signup();
  db.prepare('UPDATE sessions SET expires_at = unixepoch() - 1').run();
  assert.equal((await me.get('/dashboard')).status, 302);
});

test('nav changes with login state', async (t) => {
  const { person } = await serve(t);
  const anon = await (await person().get('/')).text();
  assert.match(anon, /href="\/login"/);
  assert.doesNotMatch(anon, /My puzzles/);
  const me = person(); await me.signup();
  const html = await (await me.get('/')).text();
  assert.match(html, /My puzzles/);
  assert.match(html, /aria-hidden="true">PM</);
});

test('settings: update credit, bio and link; refuses scripts', async (t) => {
  const { person, db } = await serve(t);
  const me = person(); await me.signup();
  assert.equal((await person().get('/settings')).status, 302);

  const bad = await me.form('/settings', { display_name: 'Priya', bio: 'hi', social_url: 'javascript:alert(1)' });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /doesn&#39;t look like a link/);

  const ok = await me.form('/settings', { display_name: 'Priya P', bio: 'Weekly puzzles.', social_url: 'instagram.com/priyamakes' });
  assert.equal(ok.status, 302);
  const u = db.prepare('SELECT display_name, bio, social_url FROM users').get();
  assert.deepEqual({ ...u }, { display_name: 'Priya P', bio: 'Weekly puzzles.', social_url: 'https://instagram.com/priyamakes' });

  const { id } = await (await me.post('/api/puzzles', good())).json();
  const html = await (await person().get(`/p/${id}`)).text();
  assert.match(html, />Priya P</);
  assert.match(html, /Follow @priyamakes/);
});

test('profile and dashboard show puzzles, plays and the most common wrong guess', async (t) => {
  const { person, db } = await serve(t);
  const me = person(); await me.signup();
  await me.form('/settings', { display_name: 'Priya P', bio: 'Weekly puzzles.', social_url: 'instagram.com/priyamakes' });
  const { id } = await (await me.post('/api/puzzles', good())).json();
  const bad = ['Mouse', 'Door', 'Swing', 'Battery'];
  const ins = db.prepare('INSERT INTO plays (puzzle_id, player_key, won, mistakes, guesses_json) VALUES (?,?,?,?,?)');
  for (let i = 0; i < 6; i++) ins.run(id, 'player-key-' + i, i < 4 ? 1 : 0, i < 4 ? 1 : 4, JSON.stringify([bad]));

  const dash = await (await me.get('/dashboard')).text();
  assert.match(dash, /Group Chat Chaos/);
  assert.match(dash, /<b>6<\/b>/);
  assert.match(dash, /67%/);
  assert.match(dash, /Battery, Door, Mouse, Swing \(6 players\)/);
  assert.match(dash, new RegExp(`data-delete="${id}"`));

  const anon = person();
  const prof = await (await anon.get('/u/PRIYA')).text();
  assert.match(prof, /Priya P/);
  assert.match(prof, /Weekly puzzles\./);
  assert.match(prof, /Group Chat Chaos/);
  assert.match(prof, /6 plays · 67% solve/);
  assert.match(prof, /Follow Priya/);
  assert.equal((await anon.get('/u/nobody')).status, 404);
  assert.equal((await anon.get('/u/priya?sort=plays')).status, 200);
  assert.equal((await anon.get('/u/priya?sort=garbage')).status, 200);
});

test('a puzzle you cannot see on your dashboard is not someone else\'s', async (t) => {
  const { person } = await serve(t);
  const a = person(); await a.signup();
  const b = person(); await b.signup({ username: 'sam', email: 's@x.com', display_name: 'Sam' });
  await a.post('/api/puzzles', good());
  assert.doesNotMatch(await (await b.get('/dashboard')).text(), /Group Chat Chaos/);
  assert.match(await (await b.get('/dashboard')).text(), /Nothing here yet/);
});
