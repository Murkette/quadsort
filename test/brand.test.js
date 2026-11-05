const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { serve, good } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const css = read('public/css/site.css');

test('the rainbow is the six classic stripes, in order, and the only place those colors are all used together', () => {
  const stripes = [...read('public/css/site.css').match(/--rainbow: linear-gradient\(([^;]*)\);/)[1].matchAll(/#([0-9A-F]{6})/g)].map((m) => '#' + m[1]);
  assert.deepEqual(stripes, ['#61BB46', '#FDB827', '#F5821F', '#E03A3E', '#963D97', '#009DDC']);
  const used = css.match(/var\(--rainbow\)/g) || [];
  assert.equal(used.length, 3, 'the page band, the Daily banner and the Daily card, nothing else');
});

test('puzzle difficulty uses four of the stripes, not new colors', () => {
  const d = (n) => new RegExp(`--d${n}: (#[0-9A-F]{6})`).exec(css)[1];
  assert.deepEqual([1, 2, 3, 4].map(d), ['#61BB46', '#FDB827', '#F5821F', '#963D97']);
});

test('the logo is untouched: its four original colors are pinned and do not follow the page palette', () => {
  const mark = read('views/partials/mark.ejs');
  for (const hex of ['#FFD84D', '#5EC4E6', '#FF8B4A', '#5A3DE0']) assert.ok(mark.includes(hex), hex);
  assert.doesNotMatch(mark, /var\(--d/);
  assert.match(read('public/favicon.svg'), /#FFD84D/);
});

test('fonts: Garamond and Archivo are served; the old pair is gone', async (t) => {
  const { url, person } = await serve(t);
  for (const f of ['garamond', 'archivo']) {
    const res = await fetch(`${url}/fonts/${f}.woff2`);
    assert.equal(res.status, 200, f);
    assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString(), 'wOF2', `${f} is a real woff2`);
  }
  for (const f of ['bricolage', 'figtree']) assert.equal((await fetch(`${url}/fonts/${f}.woff2`)).status, 404, f);
  const html = await (await person().get('/')).text();
  assert.match(html, /rel="preload" href="\/fonts\/garamond\.woff2"/);
  assert.match(html, /rel="preload" href="\/fonts\/archivo\.woff2"/);
  assert.match(css, /--fd: "EB Garamond"/);
  assert.match(css, /--fb: "Archivo"/);
  assert.doesNotMatch(css, /Bricolage|Figtree/);
});

test('the rainbow band opens every page, above the header', async (t) => {
  const { person } = await serve(t);
  const me = person(); await me.signup();
  for (const [who, p] of [[person(), '/'], [person(), '/browse'], [person(), '/login'], [person(), '/nope'], [person(), '/daily'], [me, '/dashboard'], [me, '/create']]) {
    const html = await (await who.get(p)).text();
    const band = html.indexOf('<div class="rainbow" aria-hidden="true"></div>');
    assert.ok(band > 0 && band < html.indexOf('<header class="top'), `${p}: band above header`);
    assert.equal((html.match(/class="rainbow"/g) || []).length, 1, `${p}: exactly one`);
  }
});

test('the Daily banner carries the band too, via the stylesheet', async (t) => {
  const { person } = await serve(t);
  assert.match(css, /\.daily-banner::before \{[^}]*var\(--rainbow\)/);
  assert.match(await (await person().get('/daily')).text(), /class="daily-banner"/);
});

test('one primary button per screen', async (t) => {
  const { person } = await serve(t);
  const me = person(); await me.signup();
  const pages = [[person(), '/'], [person(), '/browse?q=zzzzzz'], [person(), '/login'], [person(), '/nope'], [me, '/dashboard']];
  for (const [who, p] of pages) {
    const html = await (await who.get(p)).text();
    assert.ok((html.match(/class="btn btn-primary/g) || []).length <= 1, `${p} has more than one primary button`);
  }
});

test('the voice: plain, American, no telling-off, on every screen', async (t) => {
  const { person, db } = await serve(t);
  const me = person(); await me.signup();
  const { id } = await (await me.post('/api/puzzles', good())).json();
  for (let i = 0; i < 3; i++) db.prepare("INSERT INTO plays (puzzle_id, player_key, won, mistakes, guesses_json) VALUES (?, ?, 1, 0, '[]')").run(id, 'player-key-' + i); // so the dashboard row shows its stats copy
  db.prepare("UPDATE users SET is_admin = 1").run();
  const screens = [[person(), '/'], [person(), '/browse'], [person(), '/browse?q=zzzz'], [person(), '/p/demo0001'], [person(), '/daily'], [person(), '/login'],
    [person(), '/signup'], [person(), '/forgot'], [person(), '/nope'], [me, '/create'], [me, '/dashboard'], [me, '/settings'], [me, '/admin'], [me, '/admin?tab=daily']];
  const banned = /Sort yourself|Annoyingly|Not even close|Painful|Smug|show-off|\bmates\b|crumble|sausage|Allegedly|Insufferable|suffer|struggle|fail at|Obviously|merciless|humbled|Suspicious|Reckon|meaner|ruin someone|Trainers|Halloumi/i;
  const british = /\b(colour|colours|favourite|neighbour|centre|grey|programme|organise|realise|catalogue|whilst|cheers)\b/i;
  const scripts = ['play', 'results', 'demo', 'create', 'common', 'report', 'dashboard'].map((f) => read(`public/js/${f}.js`).replace(/\/\/.*$/gm, '')).join('\n');
  for (const [who, p] of screens) {
    const text = (await (await who.get(p)).text()).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(text, banned, `${p}: ${(text.match(banned) || [])[0]}`);
    assert.doesNotMatch(text, british, `${p}: ${(text.match(british) || [])[0]}`);
  }
  assert.doesNotMatch(scripts, banned, `scripts: ${(scripts.match(banned) || [])[0]}`);
  const { PUZZLES } = require('../scripts/seed-puzzles');
  assert.doesNotMatch(JSON.stringify(PUZZLES), banned, 'house puzzles');
});

test('the new voice lines are the ones in the brief', async (t) => {
  const { person } = await serve(t);
  const home = await (await person().get('/')).text();
  assert.match(home, /<h1>Four groups of four\.<\/h1>/);
  assert.match(home, /Make a word puzzle, share one link, see how everyone did\./);
  const js = read('public/js/play.js') + read('public/js/results.js') + read('public/js/demo.js');
  for (const line of ["'Already tried.'", "'Not quite.'", "'One away.'", "'Out of guesses.'", "'Solved.'"]) assert.ok(js.includes(line), line);
});

test('asset URLs are fingerprinted, so a changed stylesheet or script is never served from a week-old cache', async (t) => {
  const { url, person } = await serve(t);
  const html = await (await person().get('/')).text();
  const css = /href="(\/css\/site\.css\?v=[0-9a-f]{8})"/.exec(html);
  assert.ok(css, 'stylesheet link is versioned');
  assert.match(html, /src="\/js\/theme\.js\?v=[0-9a-f]{8}"/);
  assert.match(html, /src="\/js\/demo\.js\?v=[0-9a-f]{8}"/);
  assert.equal((await fetch(url + css[1])).status, 200, 'the versioned URL still serves the file');
  const again = /href="(\/css\/site\.css\?v=[0-9a-f]{8})"/.exec(await (await person().get('/browse')).text());
  assert.equal(again[1], css[1], 'same file, same fingerprint, on every page');
  assert.notEqual(css[1].split('=')[1], '00000000');
});
