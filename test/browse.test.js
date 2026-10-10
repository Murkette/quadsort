const test = require('node:test');
const assert = require('node:assert');
const { serve } = require('./helpers');
const { search } = require('../lib/browse');
const open = require('../db');

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);
const GROUPS = '[{"name":"A","level":1,"words":["a","b","c","d"]}]';

// A db with the demo puzzle removed, so each test controls exactly what exists.
function fresh() {
  const db = open(':memory:');
  db.prepare("DELETE FROM puzzles WHERE id = 'demo0001'").run();
  db.prepare("INSERT INTO users (id, username, email, password_hash, display_name) VALUES (1,'priya','p@x.com','x','Priya Makes Puzzles'), (2,'sam_9','s@x.com','x','Sam')").run();
  const mk = db.prepare('INSERT INTO puzzles (id, user_id, title, groups_json, tags, created_at, is_published, is_flagged) VALUES (?,?,?,?,?,?,?,?)');
  const play = db.prepare('INSERT INTO plays (puzzle_id, player_key, won, mistakes, guesses_json, created_at) VALUES (?,?,?,?,?,?)');
  let n = 0;
  return {
    db,
    puzzle: (id, title, o = {}) => mk.run(id, 'user' in o ? o.user : 1, title, GROUPS, o.tags ?? '', o.at ?? now(), o.published ?? 1, o.flagged ?? 0),
    plays: (id, count, { won = 1, daysAgo = 0 } = {}) => { for (let i = 0; i < count; i++) play.run(id, 'key-' + id + (n++), won, won ? 0 : 4, '[]', now() - daysAgo * DAY); },
  };
}
const titles = (r) => r.rows.map((x) => x.title);

test('trending ranks by plays in the last 7 days, not all time', () => {
  const { db, puzzle, plays } = fresh();
  puzzle('old00000', 'Old Hit'); plays('old00000', 50, { daysAgo: 30 });
  puzzle('hot00000', 'Hot Now'); plays('hot00000', 5);
  puzzle('quiet000', 'Quiet', { at: now() - 5 * DAY });
  assert.deepEqual(titles(search(db, { sort: 'trending' })), ['Hot Now', 'Old Hit', 'Quiet']);
  assert.deepEqual(titles(search(db, { sort: 'plays' })), ['Old Hit', 'Hot Now', 'Quiet']);
  const newest = titles(search(db, { sort: 'new' }));
  assert.equal(newest[newest.length - 1], 'Quiet', 'oldest last');
  assert.deepEqual(titles(search(db, { sort: 'DROP TABLE puzzles' })), titles(search(db, { sort: 'trending' })), 'unknown sort falls back');
});

test('only live puzzles are listed', () => {
  const { db, puzzle } = fresh();
  puzzle('live0000', 'Live');
  puzzle('flag0000', 'Flagged', { flagged: 1 });
  puzzle('hide0000', 'Unpublished', { published: 0 });
  assert.deepEqual(titles(search(db)), ['Live']);
});

test('cards carry creator, topic, plays and a difficulty from real players', () => {
  const { db, puzzle, plays } = fresh();
  puzzle('card0000', 'Cheese Quiz', { tags: 'food,music' });
  plays('card0000', 3, { won: 1 }); plays('card0000', 7, { won: 0 });
  const [c] = search(db).rows;
  assert.equal(c.by, 'Priya Makes Puzzles');
  assert.equal(c.tag, 'Food & drink');
  assert.equal(c.plays, 10);
  assert.equal(c.solveRate, 0.3);
  assert.equal(c.diff, 4, '30% solve is Devious');
  puzzle('new00000', 'Brand New', { user: null });
  const fresh1 = search(db, { q: 'Brand' }).rows[0];
  assert.equal(fresh1.by, 'Quadsort');
  assert.equal(fresh1.diff, null, 'too few plays to judge');
});

test('topic filter: known topics only', () => {
  const { db, puzzle } = fresh();
  puzzle('food0000', 'Pizza', { tags: 'food' });
  puzzle('mix00000', 'Pizza Songs', { tags: 'music,food' });
  puzzle('mus00000', 'Bands', { tags: 'music' });
  puzzle('none0000', 'Untagged');
  assert.deepEqual(titles(search(db, { tag: 'food', sort: 'new' })).sort(), ['Pizza', 'Pizza Songs']);
  assert.equal(search(db, { tag: 'musi' }).total, 4, 'a partial or unknown topic is ignored, not a LIKE');
  assert.equal(search(db, { tag: "' OR 1=1 --" }).total, 4);
});

test('search: title, creator name, username and topic; wildcards are literal', () => {
  const { db, puzzle } = fresh();
  puzzle('p1000000', 'Cheese Quiz', { tags: 'food' });
  puzzle('p2000000', '100% Pure', { user: 2 });
  puzzle('p3000000', 'Snake_case', { user: 2 });
  puzzle('p3500000', 'Snakexcase');
  puzzle('p4000000', 'Bands', { tags: 'music', user: 2 });
  const q = (s) => titles(search(db, { q: s, sort: 'new' })).sort();
  assert.deepEqual(q('cheese'), ['Cheese Quiz']);
  assert.deepEqual(q('priya'), ['Cheese Quiz', 'Snakexcase'], 'by creator display name');
  assert.deepEqual(q('sam_9'), ['100% Pure', 'Bands', 'Snake_case'], 'by username');
  assert.deepEqual(q('sam_'), ['100% Pure', 'Bands', 'Snake_case']);
  assert.deepEqual(q('food'), ['Cheese Quiz'], 'by topic label');
  assert.deepEqual(q('mus'), ['Bands']);
  assert.deepEqual(q('%'), ['100% Pure'], '% is not a wildcard');
  assert.deepEqual(q('e_c'), ['Snake_case'], '_ is not a wildcard (it would also match Snakexcase)');
  assert.deepEqual(q("x' OR '1'='1"), []);
  assert.deepEqual(q('   '), q(''), 'blank search lists everything');
  assert.deepEqual(search(db, { q: 'cheese', tag: 'music' }).rows, [], 'search and topic combine');
});

test('paging: 24 a page, clamped, with the right count', () => {
  const { db, puzzle } = fresh();
  for (let i = 0; i < 30; i++) puzzle('pg' + String(i).padStart(6, '0'), 'Puzzle ' + i, { at: now() - i });
  const p1 = search(db, { sort: 'new' }), p2 = search(db, { sort: 'new', page: 2 });
  assert.equal(p1.rows.length, 24);
  assert.equal(p2.rows.length, 6);
  assert.equal(p1.total, 30);
  assert.equal(p1.pages, 2);
  assert.equal(search(db, { page: 999 }).page, 2, 'too far clamps to the last page');
  assert.equal(search(db, { page: -4 }).page, 1);
  assert.equal(search(db, { page: 'x' }).page, 1);
  assert.equal(search(db, { sort: 'new', per: 4 }).rows.length, 4);
});

test('browse page renders, keeps your filters in its links, and has an empty state', async (t) => {
  const { db, puzzle } = fresh();
  puzzle('food0000', 'Cheese Quiz', { tags: 'food' });
  const { person } = await serve(t, db);
  const anon = person();
  let html = await (await anon.get('/browse?tag=food&sort=new&q=cheese')).text();
  assert.match(html, /Find something to fail at\./);
  assert.match(html, /1 puzzle for “cheese”/);
  assert.match(html, /Cheese Quiz/);
  assert.match(html, /href="\/browse\?q=cheese&amp;tag=food"[^>]*>Trending/, 'switching sort keeps search and topic');
  assert.match(html, /name="tag" value="food"/);
  assert.match(html, /aria-current="true">Food &amp; drink</);

  html = await (await anon.get('/browse?q=zzzz')).text();
  assert.match(html, /Nothing\. Not a sausage\./);
  html = await (await anon.get('/browse?q=<script>alert(1)</script>')).text();
  assert.doesNotMatch(html, /<script>alert/, 'search text is escaped');
});

test('landing: playable demo, trending cards, no fake numbers', async (t) => {
  const { db, puzzle, plays } = fresh();
  puzzle('top00000', 'Top Puzzle'); plays('top00000', 6);
  puzzle('low00000', 'Low Puzzle');
  const { person } = await serve(t, db);
  const html = await (await person().get('/')).text();
  assert.match(html, /Make a word puzzle\. Send the link\./);
  assert.match(html, /id="demo"/);
  assert.match(html, /src="\/js\/demo\.js"/);
  assert.ok(html.indexOf('Top Puzzle') < html.indexOf('Low Puzzle'), 'trending order');
  assert.doesNotMatch(html, /puzzles made this week/, 'hidden until the number is worth showing');
  for (let i = 0; i < 10; i++) puzzle('wk' + String(i).padStart(6, '0'), 'Week ' + i);
  assert.match(await (await person().get('/')).text(), /12 puzzles made this week/);
  assert.match(html, /href="\/browse"/);
  assert.match(html, /class="site-foot"/);
});
