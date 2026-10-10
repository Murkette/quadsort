// Puzzle creator: live validation + preview, local draft, publish, share. The server re-checks everything.
(() => {
  const root = document.getElementById('create');
  if (!root) return;
  const V = window.QSValidate, store = QS.store;
  const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)];
  const byId = (id) => document.getElementById(id);
  const published = byId('published');
  const f = { title: $('#f-title'), description: $('#f-desc') };
  const cards = $$('.gcard'), tagBoxes = $$('input[name="tag"]');
  const publishBtn = $('#publish'), msg = $('#pub-msg');
  const MAX = V.LIMITS.word;
  const DRAFT = 'qs:draft';
  const loggedIn = root.dataset.auth === '1', myName = root.dataset.name;
  let puzzleId = root.dataset.id || '';
  const isNew = !puzzleId;
  let busy = false;

  const read = () => ({
    title: f.title.value, description: f.description.value,
    tags: tagBoxes.filter((b) => b.checked).map((b) => b.value),
    groups: cards.map((c) => ({
      level: Number(c.querySelector('.glevel').value), name: c.querySelector('.gname').value,
      words: [...c.querySelectorAll('.wi')].map((i) => i.value),
    })),
  });

  function fill(d) {
    f.title.value = d.title || ''; f.description.value = d.description || '';
    tagBoxes.forEach((b) => (b.checked = (d.tags || []).includes(b.value)));
    cards.forEach((c, i) => {
      const g = (d.groups || [])[i] || {};
      c.querySelector('.glevel').value = String(g.level || i + 1);
      c.querySelector('.gname').value = g.name || '';
      c.querySelectorAll('.wi').forEach((inp, j) => (inp.value = (g.words || [])[j] || ''));
    });
    if (new Set(cards.map((c) => c.querySelector('.glevel').value)).size !== 4) cards.forEach((c, i) => (c.querySelector('.glevel').value = String(i + 1)));
  }

  // ---------- preview: sixteen slots, shuffled once, filled live ----------
  const shuffled = () => {
    const a = [...Array(16).keys()];
    for (let i = 15; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  let perm = shuffled();
  const pgrid = $('#pgrid');
  const pTiles = Array.from({ length: 16 }, () => { const t = document.createElement('span'); pgrid.append(t); return t; });
  $('#reshuffle').onclick = () => { perm = shuffled(); render(); };

  const lenClass = (n) => (n <= 5 ? 1 : n <= 7 ? 2 : n <= 9 ? 3 : 4);
  const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };

  function render() {
    const raw = read();
    const res = V.validate(raw);
    const by = {};
    res.errors.forEach((e) => (by[e.field] = by[e.field] || []).push(e));
    const real = (field) => (by[field] || []).filter((e) => e.tone !== 'missing'); // "missing" is summarised, not nagged

    $$('.ferr').forEach((s) => {
      const e = real(s.dataset.for)[0];
      s.textContent = e ? e.msg : '';
      s.className = 'ferr' + (e ? ' ' + e.tone : '');
    });
    for (const [k, input] of Object.entries(f)) input.setAttribute('aria-invalid', real(k).length > 0);
    const picked = tagBoxes.filter((b) => b.checked).length;
    tagBoxes.forEach((b) => (b.disabled = !b.checked && picked >= V.LIMITS.tags));

    const levels = raw.groups.map((g) => g.level).sort((a, b) => a - b);
    const label = (i) => V.clean(raw.groups[i].name) || `Group ${levels.indexOf(raw.groups[i].level) + 1}`;
    const issues = real('title').concat(real('description'), real('tags')).map((e) => e.msg);
    let missWords = 0, missNames = 0;

    cards.forEach((c, i) => {
      const g = raw.groups[i];
      c.querySelector('.gband').dataset.level = g.level;
      c.querySelector('.shape').dataset.level = g.level;
      c.querySelector('.gpos').textContent = levels.indexOf(g.level) + 1;

      const inputs = [...c.querySelectorAll('.wi')], counters = c.querySelectorAll('.wc');
      inputs.forEach((inp, j) => {
        const es = by[`g${i}.w${j}`] || [];
        const dup = es.some((e) => e.tone === 'err'), long = es.some((e) => e.tone === 'warn');
        inp.classList.toggle('bad', dup);
        inp.classList.toggle('long', long);
        inp.classList.toggle('empty', !inp.value.trim());
        inp.setAttribute('aria-invalid', dup || long);
        const n = V.clean(inp.value).length;
        counters[j].textContent = n >= MAX - 2 ? `${n}/${MAX}` : ''; // only near the limit, so it never crowds a normal word
        inp.classList.toggle('cond', n >= 9);
        inp.classList.toggle('cnt', n >= MAX - 2);
      });
      const nameErr = real(`g${i}.name`)[0];
      c.querySelector('.gname').classList.toggle('bad', !!nameErr);
      c.querySelector('.gname').setAttribute('aria-invalid', !!nameErr);

      const started = g.name.trim() || inputs.some((x) => x.value.trim());
      const lines = [];
      real(`g${i}.name`).concat(real(`g${i}.level`)).forEach((e) => lines.push(e));
      for (let j = 0; j < 4; j++) real(`g${i}.w${j}`).forEach((e) => lines.push(e));
      const empties = inputs.filter((x) => !x.value.trim()).length;
      const noName = !g.name.trim();
      missWords += empties; missNames += noName ? 1 : 0;
      if (started && empties) lines.push({ tone: 'missing', msg: empties === 1 ? 'One word missing. Three down, one to go.' : `${empties} words missing.` });
      if (started && noName) lines.push({ tone: 'missing', msg: 'Give this group a name. Players see it when they solve it.' });
      c.querySelector('.gerrs').replaceChildren(...lines.map((e) => el('span', 'gerr ' + e.tone, e.msg)));
      lines.filter((e) => e.tone !== 'missing').forEach((e) => issues.push(`${label(i)}: ${e.msg}`));
    });

    if (by.title && !real('title').length) issues.push(by.title[0].msg);
    if (missNames) issues.push(missNames === 1 ? '1 group name missing.' : `${missNames} group names missing.`);
    if (missWords) issues.push(missWords === 1 ? '1 word still to write.' : `${missWords} words still to write.`);

    // preview
    const flat = cards.flatMap((c) => [...c.querySelectorAll('.wi')].map((i) => V.clean(i.value).toUpperCase()));
    pTiles.forEach((t, s) => {
      const w = flat[perm[s]];
      t.textContent = w || '?';
      t.className = 'pt len' + lenClass(w.length) + (!w ? ' empty' : w.length > MAX ? ' long' : '');
    });
    byId('pv-title').textContent = V.clean(raw.title) || 'Your puzzle title';
    byId('pv-by').textContent = 'by ' + (myName || 'you');

    byId('issues').hidden = !issues.length;
    byId('ready').hidden = !!issues.length;
    byId('issues-title').textContent = issues.length === 1 ? 'One thing to fix.' : `${issues.length} things to fix.`;
    byId('issues-list').replaceChildren(...issues.map((m) => el('li', '', m)));
    publishBtn.disabled = busy || !res.ok;
    publishBtn.textContent = busy ? 'Publishing…' : puzzleId ? 'Save changes' : 'Publish puzzle';
  }

  // Cards sit in difficulty order in the page itself (not just on screen), so Tab goes the way the eye does.
  const reorder = () => {
    const had = document.activeElement; // moving a node can drop focus; put it back
    const lv = (c) => Number(c.querySelector('.glevel').value);
    [...cards].sort((a, b) => lv(a) - lv(b)).forEach((c) => byId('ggrid').append(c));
    if (had && had !== document.body && document.contains(had) && document.activeElement !== had) had.focus({ preventScroll: true });
  };

  // ---------- input ----------
  let draftTimer;
  const changed = () => {
    render();
    if (!isNew || puzzleId) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => store.set(DRAFT, read()), 300); // a reload mid-puzzle must not eat sixteen words
  };
  $('#form').addEventListener('input', changed);
  $('#form').addEventListener('change', (e) => {
    if (e.target.matches('.glevel')) { // every group needs its own difficulty: swap with whoever has it
      const sel = e.target, old = sel.dataset.prev;
      const other = cards.map((c) => c.querySelector('.glevel')).find((s) => s !== sel && s.value === sel.value);
      if (other) { other.value = old; other.dataset.prev = old; }
      sel.dataset.prev = sel.value;
      reorder();
    }
    changed();
  });
  $('#form').addEventListener('submit', (e) => e.preventDefault());

  // ---------- publish ----------
  const say = (t) => { msg.textContent = t; msg.hidden = !t; };
  // Not logged in: the puzzle is already saved as a local draft, so signing up costs nothing but a minute.
  const toSignup = () => { clearTimeout(draftTimer); store.set(DRAFT, read()); location.href = '/signup?next=' + encodeURIComponent('/create'); };
  publishBtn.onclick = async () => {
    if (publishBtn.disabled) return;
    if (!loggedIn) return toSignup();
    busy = true; say(''); render();
    try {
      const res = await fetch(puzzleId ? `/api/puzzles/${puzzleId}` : '/api/puzzles', {
        method: puzzleId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(read()),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error('publish failed'), { status: res.status, body });
      done(body);
    } catch (e) {
      if (e.status === 401) return toSignup();
      say(e.status === 429 ? (e.body.error || 'Slow down.')
        : e.status === 400 ? 'The server disagrees with something in the form. Check the highlighted bits.'
        : e.status === 404 ? "This puzzle isn't yours to edit from this browser."
        : 'Network hiccup. Try again.');
    } finally { busy = false; render(); }
  };

  function done(body) {
    const wasNew = !puzzleId;
    puzzleId = body.id;
    store.del(DRAFT);
    history.replaceState(null, '', `/p/${puzzleId}/edit`); // a refresh now reopens the editor, not a blank form
    const url = location.origin + body.url;
    const title = V.clean(f.title.value);
    byId('pub-h').textContent = wasNew ? 'Published.' : 'Saved.';
    byId('pub-sub').textContent = body.statsReset ? 'The groups changed, so the old plays and stats were cleared.' : 'Now go and ruin someone’s afternoon.';
    byId('share-link').value = url.replace(/^https?:\/\//, '');
    byId('pub-play').href = body.url;

    const text = `Think you can sort this? “${title}”`, enc = encodeURIComponent;
    const grid = byId('sharegrid');
    grid.replaceChildren(...[
      ['WhatsApp', `https://wa.me/?text=${enc(text + ' ' + url)}`],
      ['X', `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`],
      ['Reddit', `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(title)}`],
      ['Email', `mailto:?subject=${enc(title)}&body=${enc(text + '\n' + url)}`],
    ].map(([name, href]) => Object.assign(el('a', 'btn btn-sm share', name), { href, target: '_blank', rel: 'noopener' })));
    if (navigator.share) {
      const more = el('button', 'btn btn-sm share', 'More…');
      more.type = 'button';
      more.onclick = () => navigator.share({ title, text, url }).catch(() => {});
      grid.append(more);
    }
    let t;
    byId('pub-copy').onclick = async () => {
      const ok = await QS.copy(url), label = byId('pub-copy-label'), b = byId('pub-copy');
      label.textContent = ok ? 'Copied' : 'Copy failed';
      b.classList.toggle('done', ok);
      clearTimeout(t);
      t = setTimeout(() => { label.textContent = 'Copy link'; b.classList.remove('done'); }, 1800);
    };
    root.hidden = true; published.hidden = false; scrollTo(0, 0);
  }

  byId('pub-edit').onclick = () => { published.hidden = true; root.hidden = false; $('h1').textContent = 'Edit your puzzle'; scrollTo(0, 0); render(); };

  // ---------- start ----------
  if (isNew) {
    const d = store.get(DRAFT, null);
    if (d) fill(d);
  }
  cards.forEach((c) => { const s = c.querySelector('.glevel'); s.dataset.prev = s.value; });
  reorder();
  render();
})();
