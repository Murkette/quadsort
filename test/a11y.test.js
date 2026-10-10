const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { serve, good } = require('./helpers');

// ---- colour contrast, straight from the stylesheet, so a palette tweak that breaks it fails here ----
const css = fs.readFileSync(path.join(__dirname, '../public/css/site.css'), 'utf8');
const vars = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})/g)].map((m) => [m[1], m[2]]));
const light = vars(css.match(/:root \{[^}]*--bg:[^}]*\}/)[0]);
const darkMedia = vars(css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/)[1]);
const darkForced = vars(css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)[1]);
// the error colour lives in its own small blocks, further down the file
light.err = css.match(/:root \{ --err: (#\w+)/)[1];
darkMedia.err = css.match(/:root:not\(\[data-theme="light"\]\) \{ --err: (#\w+)/)[1];
darkForced.err = css.match(/:root\[data-theme="dark"\] \{ --err: (#\w+)/)[1];

const lum = (hex) => {
  const h = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('the two dark theme blocks (device setting and manual switch) are identical', () => {
  assert.deepEqual(darkForced, darkMedia);
});

for (const [name, t] of [['light', light], ['dark', darkMedia]]) {
  test(`${name}: text, borders and focus ring have enough contrast`, () => {
    for (const bg of ['bg', 'surf', 'surf2']) {
      assert.ok(ratio(t.ink, t[bg]) >= 4.5, `ink on ${bg}`);
      assert.ok(ratio(t.mute, t[bg]) >= 4.5, `mute on ${bg}`);
      assert.ok(ratio(t.err, t[bg]) >= 4.5, `error on ${bg}`);
      assert.ok(ratio(t.line, t[bg]) >= 3, `borders on ${bg} (WCAG 1.4.11)`);
      assert.ok(ratio(t.focus, t[bg]) >= 3, `focus ring on ${bg}`);
    }
    assert.ok(ratio(t.tileInk, t.tile) >= 4.5, 'tile text');
    assert.ok(ratio(t.line, t.tile) >= 3, 'tile border');
    assert.ok(ratio(t.invInk, t.inv) >= 4.5, 'selected tile / primary button');
  });
}

test('difficulty colours carry their text at AA in both themes (they do not change)', () => {
  assert.ok(ratio('#17142A', light.d1) >= 4.5);
  assert.ok(ratio('#17142A', light.d2) >= 4.5);
  assert.ok(ratio('#17142A', light.d3) >= 4.5);
  assert.ok(ratio('#FFFFFF', light.d4) >= 4.5);
  assert.deepEqual(light.d1 && [light.d1, light.d2, light.d3, light.d4].length, 4);
});

// ---- page structure ----
test('every page has a skip link, a main landmark, one h1, a theme switch and a live region', async (t) => {
  const { person } = await serve(t);
  const me = person(); await me.signup();
  const anon = person();
  const pages = [[anon, '/'], [anon, '/browse'], [anon, '/login'], [anon, '/signup'], [anon, '/nope'], [me, '/'], [me, '/dashboard'], [me, '/settings']];
  for (const [who, url] of pages) {
    const html = await (await who.get(url)).text();
    assert.match(html, /<a class="skip" href="#main">Skip to content<\/a>/, url);
    assert.match(html, /<main id="main" tabindex="-1">/, url);
    assert.match(html, /id="qs-live"[^>]*aria-live="polite"/, url);
    assert.match(html, /data-theme-set="dark"/, url);
    assert.match(html, /<html lang="en">/, url);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${url} should have exactly one h1`);
  }
});

test('the saved theme is applied before the stylesheet loads, so there is no flash', async (t) => {
  const { person } = await serve(t);
  const html = await (await person().get('/')).text();
  const script = html.indexOf("localStorage.getItem('qs:theme')");
  assert.ok(script > 0 && script < html.indexOf('/css/site.css'));
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
});

test('repeated buttons say which puzzle they belong to, and the name contains the visible text', async (t) => {
  const { person } = await serve(t);
  const me = person(); await me.signup();
  await me.post('/api/puzzles', { ...good(), title: 'Label Test' });
  const html = await (await me.get('/dashboard')).text();
  assert.match(html, />Edit<\/a>/);
  assert.match(html, /aria-label="Edit Label Test"/);
  assert.match(html, /aria-label="Copy link to Label Test"/);
  assert.match(html, /aria-label="Delete Label Test"/);
});

test('the avatar link has a text name that includes nothing hidden from view', async (t) => {
  const { person } = await serve(t);
  const me = person(); await me.signup();
  const html = await (await me.get('/')).text();
  assert.match(html, /<span aria-hidden="true">PM<\/span><span class="sr">Your profile<\/span>/);
});

test('game and results markup is accessible by design', async (t) => {
  const { person } = await serve(t);
  const html = await (await person().get('/p/demo0001')).text();
  assert.match(html, /role="group" aria-label="Sixteen words/);
  assert.match(html, /id="toast" role="status"/);
  assert.match(html, /role="img" aria-label="4 of 4 mistakes left"/);
  assert.equal((html.match(/aria-pressed="false" data-w=/g) || []).length, 16, 'every tile is a toggle button');
});
