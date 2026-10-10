const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { serve, good } = require('./helpers');

const meta = (html, name) => (new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`).exec(html) || [])[1];
const bytes = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());

test('brand images exist, with the sizes the platforms expect', async (t) => {
  const { url } = await serve(t);
  const png = (b) => ({ sig: b.subarray(1, 4).toString(), w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
  assert.deepEqual(png(await bytes(url + '/og.png')), { sig: 'PNG', w: 1200, h: 630 });
  assert.deepEqual(png(await bytes(url + '/apple-touch-icon.png')), { sig: 'PNG', w: 180, h: 180 });
  const ico = await bytes(url + '/favicon.ico');
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 3], 'an .ico holding three sizes');
  const svg = await fetch(url + '/favicon.svg');
  assert.match(svg.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await svg.text(), /<svg/);
});

test('every page links the icons and states a canonical address', async (t) => {
  const { url, person } = await serve(t);
  const html = await (await person().get('/')).text();
  assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="32x32">/);
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/);
  assert.match(html, /name="theme-color" content="#13111C" media="\(prefers-color-scheme: dark\)"/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${url}/">`));
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, /<title>Quadsort · Make a word puzzle\. Send the link\.<\/title>/);
});

test('share tags use absolute URLs, so WhatsApp, X, iMessage and Slack can fetch the image', async (t) => {
  const { url, person } = await serve(t);
  const html = await (await person().get('/')).text();
  assert.equal(meta(html, 'og:image'), `${url}/og.png`);
  assert.equal(meta(html, 'og:url'), `${url}/`);
  assert.equal(meta(html, 'og:image:width'), '1200');
  assert.equal(meta(html, 'og:image:height'), '630');
  assert.match(meta(html, 'og:image:alt'), /Quadsort puzzle/);
  assert.equal(meta(html, 'og:type'), 'website');
  assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
  assert.equal(meta(html, 'twitter:image'), `${url}/og.png`);
  assert.equal(meta(html, 'og:title'), meta(html, 'twitter:title'));
  assert.equal(meta(html, 'og:description'), meta(html, 'description'));
});

test('a puzzle link previews as that puzzle; the solve rate appears once there are enough plays', async (t) => {
  const { url, person, db } = await serve(t);
  const me = person(); await me.signup();
  const { id } = await (await me.post('/api/puzzles', { ...good(), title: 'Say "cheese" <b>', description: 'Four groups. Good luck.' })).json();
  const page = () => person().get(`/p/${id}`).then((r) => r.text());

  let html = await page();
  assert.equal(meta(html, 'og:title'), 'Say &#34;cheese&#34; &lt;b&gt;', 'quotes and tags in a title are escaped');
  assert.equal(meta(html, 'og:description'), 'Four groups. Good luck. A Quadsort puzzle by Priya Makes Puzzles.');
  assert.equal(meta(html, 'og:url'), `${url}/p/${id}`);
  assert.equal(meta(html, 'og:image'), `${url}/og.png`);
  assert.doesNotMatch(html, /noindex/);

  const ins = db.prepare('INSERT INTO plays (puzzle_id, player_key, won, mistakes, guesses_json) VALUES (?,?,?,?,?)');
  for (let i = 0; i < 20; i++) ins.run(id, 'player-key-' + i, i < 6 ? 1 : 0, i < 6 ? 0 : 4, '[]');
  assert.match(meta(await page(), 'og:description'), /Only 30% of 20 players solve it\.$/);
  db.prepare('UPDATE plays SET won = 1, mistakes = 1 WHERE rowid <= 14').run();
  assert.match(meta(await page(), 'og:description'), / 70% of 20 players solve it\.$/);

  const demo = await person().get('/p/demo0001').then((r) => r.text());
  assert.equal(meta(demo, 'og:description'), 'Make four groups of four. The group chat managed it. Allegedly. A Quadsort puzzle.', 'no "by" when nobody made it');

  db.prepare("UPDATE puzzles SET description = '' WHERE id = ?").run(id);
  assert.match(meta(await page(), 'og:description'), /^Sixteen words, four hidden groups\. Can you sort them\?/);
});

test('private and thin pages ask search engines to stay away; public ones do not', async (t) => {
  const { person } = await serve(t);
  const me = person(); await me.signup();
  const anon = person();
  const noindex = async (who, path) => /<meta name="robots" content="noindex, nofollow">/.test(await (await who.get(path)).text());
  for (const [who, path] of [[anon, '/login'], [anon, '/signup'], [anon, '/nope'], [anon, '/browse?q=cheese'], [me, '/dashboard'], [me, '/settings'], [me, '/create']]) {
    assert.ok(await noindex(who, path), `${path} should be noindex`);
  }
  for (const [who, path] of [[anon, '/'], [anon, '/browse'], [anon, '/browse?tag=food'], [anon, '/p/demo0001'], [anon, '/u/priya']]) {
    assert.ok(!(await noindex(who, path)), `${path} should be indexable`);
  }
});

test('a hidden puzzle is noindex even for the people who can still see it', async (t) => {
  const { person, db } = await serve(t);
  const me = person(); await me.signup();
  const { id } = await (await me.post('/api/puzzles', good())).json();
  db.prepare('UPDATE puzzles SET is_flagged = 1 WHERE id = ?').run(id);
  assert.match(await (await me.get(`/p/${id}`)).text(), /<meta name="robots" content="noindex, nofollow">/);
});

test('production pins the real address instead of trusting the Host header', async (t) => {
  const { url } = await serve(t);
  const get = (headers) => new Promise((resolve, reject) => http.get(url + '/', { headers }, (res) => {
    let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => resolve(body));
  }).on('error', reject));
  const saved = { site: process.env.SITE_URL, env: process.env.NODE_ENV };
  t.after(() => { for (const [k, v] of [['SITE_URL', saved.site], ['NODE_ENV', saved.env]]) v === undefined ? delete process.env[k] : (process.env[k] = v); });

  process.env.NODE_ENV = 'production'; delete process.env.SITE_URL;
  assert.equal(meta(await get({ host: 'evil.example' }), 'og:image'), 'https://quadsort.com/og.png');
  process.env.SITE_URL = 'https://staging.example';
  assert.equal(meta(await get({ host: 'evil.example' }), 'og:image'), 'https://staging.example/og.png');
});

test('robots.txt keeps crawlers out of private areas and points at the sitemap', async (t) => {
  const { url } = await serve(t);
  const res = await fetch(url + '/robots.txt');
  assert.match(res.headers.get('content-type'), /text\/plain/);
  const txt = await res.text();
  for (const p of ['/admin', '/api/', '/dashboard', '/settings', '/login', '/signup', '/create', '/p/*/edit']) assert.match(txt, new RegExp(`Disallow: ${p.replace(/[*/]/g, '\\$&')}`));
  assert.doesNotMatch(txt, /Disallow: \/\s*$/m, 'never block the whole site');
  assert.match(txt, new RegExp(`Sitemap: ${url}/sitemap\\.xml`));
});

test('sitemap lists live puzzles and creators, never hidden or unpublished ones', async (t) => {
  const { url, person, db } = await serve(t);
  const me = person(); await me.signup();
  const mk = async (title) => (await (await me.post('/api/puzzles', { ...good(), title })).json()).id;
  const live = await mk('Live'), hidden = await mk('Hidden'), draft = await mk('Draft');
  db.prepare('UPDATE puzzles SET is_flagged = 1 WHERE id = ?').run(hidden);
  db.prepare('UPDATE puzzles SET is_published = 0 WHERE id = ?').run(draft);

  const res = await fetch(url + '/sitemap.xml');
  assert.match(res.headers.get('content-type'), /application\/xml/);
  const xml = await res.text();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, new RegExp(`<loc>${url}/</loc>`));
  assert.match(xml, new RegExp(`<loc>${url}/browse</loc>`));
  assert.match(xml, new RegExp(`<loc>${url}/p/${live}</loc><lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`));
  assert.match(xml, new RegExp(`<loc>${url}/u/priya</loc>`));
  assert.match(xml, /<loc>[^<]*\/p\/demo0001<\/loc>/);
  assert.ok(!xml.includes(hidden) && !xml.includes(draft));
});
