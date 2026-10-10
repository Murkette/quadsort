// Quadsort play screen. The server owns the answers: every guess is checked via the API,
// and the full solution only arrives after a verified win or loss.
(() => {
  const root = document.querySelector('.play');
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const id = root.dataset.puzzle;
  const board = $('.board'), grid = $('#grid'), rows = $('#rows'), toastEl = $('#toast');
  const dots = [...root.querySelectorAll('#dots i')], dotsWrap = $('#dots');
  const controls = $('#controls'), lives = $('#lives'), endEl = $('#end');
  const btn = { shuffle: $('#shuffle'), deselect: $('#deselect'), submit: $('#submit') };
  const LIVES = 4;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PRAISE = ['Sorted. Smug yet?', 'Fine. Two down.', 'Alright, show-off.'];

  const tiles = {}; // word -> button
  grid.querySelectorAll('.tile').forEach((t) => (tiles[t.dataset.w] = t));

  const S = { sel: [], solved: [], mistakes: 0, guesses: [], over: null, posted: false, solution: null, busy: false };

  // ---------- persistence (a reload from a social app's in-app browser must not reset your lives) ----------
  const KEY = 'qs:' + id;
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: play on */ } },
  };
  const save = () => store.set(KEY, { guesses: S.guesses, posted: S.posted, solution: S.solution });
  const uid = () => {
    let k = store.get('qs:player');
    if (!k) {
      k = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(16).slice(2) + Date.now().toString(16);
      store.set('qs:player', k);
    }
    return k;
  };

  // ---------- helpers ----------
  const remaining = () => Object.values(tiles);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const anim = (el, frames, opts) => (el.animate ? el.animate(frames, opts) : { finished: Promise.resolve() });

  // Shrink any tile whose word doesn't fit. Starting sizes come from CSS by word length.
  function fit(el) {
    el.style.fontSize = '';
    let s = parseFloat(getComputedStyle(el).fontSize);
    while ((el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) && s > 9) {
      s -= 0.5;
      el.style.fontSize = s + 'px';
    }
  }
  const fitAll = () => remaining().forEach(fit);
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(fitAll, 120); });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(fitAll);

  let toastTimer;
  function toast(msg, hold = 1800) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.hidden = false;
    const base = 'translate(-50%, -50%)';
    if (!reduced()) anim(toastEl, [{ transform: base + ' translateY(-14px)', opacity: 0 }, { transform: base, opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    toastTimer = setTimeout(() => (toastEl.hidden = true), hold);
  }

  function sync() {
    const left = LIVES - S.mistakes;
    dots.forEach((d, i) => d.classList.toggle('gone', i >= left));
    dotsWrap.setAttribute('aria-label', `${left} of ${LIVES} mistakes left`);
    Object.entries(tiles).forEach(([w, t]) => t.setAttribute('aria-pressed', S.sel.includes(w)));
    btn.deselect.disabled = !S.sel.length || !!S.over;
    btn.submit.disabled = S.sel.length !== 4 || S.busy || !!S.over;
    btn.shuffle.disabled = !!S.over;
    grid.hidden = !remaining().length;
    board.classList.toggle('over', !!S.over);
  }

  // ---------- rows ----------
  function addRow(g, revealed) {
    const row = document.createElement('div');
    row.className = 'row' + (revealed ? ' revealed' : '');
    row.dataset.level = g.level;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `${g.name}: ${g.words.join(', ')}`);
    row.innerHTML = '<div class="name"><span class="shape" aria-hidden="true"></span><span class="label"></span></div><div class="words"></div>';
    row.querySelector('.shape').dataset.level = g.level;
    row.querySelector('.label').textContent = g.name;
    row.querySelector('.words').textContent = g.words.join(', ');
    rows.appendChild(row);
    return row;
  }

  const typeOn = (el, text) => {
    if (reduced()) return;
    el.textContent = '';
    const step = Math.max(14, Math.min(30, 420 / text.length));
    let i = 0;
    const t = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(t); }, step);
  };

  const box = (rects) => {
    const l = Math.min(...rects.map((r) => r.left)), t = Math.min(...rects.map((r) => r.top));
    return { left: l, top: t, width: Math.max(...rects.map((r) => r.right)) - l, height: Math.max(...rects.map((r) => r.bottom)) - t };
  };

  // Tiles fly up and merge into the coloured row (FLIP), then the category name types on.
  function solve(g, animate) {
    const els = g.words.map((w) => tiles[w]);
    const before = animate && !reduced() ? new Map(remaining().map((t) => [t, t.getBoundingClientRect()])) : null;
    const from = before && box(els.map((t) => before.get(t)));
    els.forEach((t, i) => { t.remove(); delete tiles[g.words[i]]; });
    S.solved.push(g);
    const row = addRow(g, false);
    sync();
    if (!animate) return;
    if (!before) { anim(row, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); return; }
    const to = row.getBoundingClientRect();
    remaining().forEach((t) => {
      const a = before.get(t), b = t.getBoundingClientRect();
      if (a.left !== b.left || a.top !== b.top) anim(t, [{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.25)' });
    });
    const label = row.querySelector('.label');
    const name = g.name;
    row.classList.add('merging'); // keep the text hidden while the row is stretched, so it never looks squashed
    anim(row, [
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 0.7 },
      { transform: 'none', opacity: 1 },
    ], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.1)' }).finished.then(() => { row.classList.remove('merging'); typeOn(label, name); });
  }

  // ---------- end of game ----------
  function showEnd() {
    controls.hidden = true;
    lives.hidden = S.over === 'won';
    endEl.className = 'end ' + S.over;
    endEl.hidden = false;
    const m = S.mistakes;
    endEl.innerHTML = S.over === 'won'
      ? `<h2>Sorted. Annoyingly well.</h2><p>${m ? `Solved with ${m} mistake${m > 1 ? 's' : ''}.` : 'No mistakes. Show-off.'}</p>`
      : '<h2>Sort yourself out.</h2><p>Out of lives. The answers are above, for your shame.</p>';
    if (!reduced()) anim(endEl, [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.25)' });
  }

  async function finish(animate) {
    S.over = S.solved.length === 4 ? 'won' : 'lost';
    S.sel = [];
    sync();
    // The server replays our guesses, logs the play once, and (only now) reveals the solution.
    if (!S.solution || !S.posted) {
      try {
        const res = await fetch('/api/plays', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ puzzleId: id, playerKey: uid(), guesses: S.guesses.map((g) => g.words) }),
        });
        if (!res.ok) throw new Error(res.status);
        S.solution = (await res.json()).solution;
        S.posted = true;
        save();
      } catch {
        if (S.over === 'lost') toast("Couldn't fetch the answers. Reload to retry.", 4000);
      }
    }
    if (S.over === 'lost' && S.solution) {
      const open = S.solution.filter((g) => !S.solved.some((s) => s.name === g.name));
      for (const g of open) {
        const row = addRow(g, true);
        Object.keys(tiles).forEach((w) => g.words.includes(w) && (tiles[w].remove(), delete tiles[w]));
        if (animate && !reduced()) { anim(row, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 300 }); await sleep(180); }
      }
      sync();
    }
    if (animate && S.over === 'won') await sleep(reduced() ? 0 : 450);
    showEnd();
  }

  // ---------- actions ----------
  grid.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t || S.over) return;
    const w = t.dataset.w;
    if (S.sel.includes(w)) S.sel = S.sel.filter((x) => x !== w);
    else if (S.sel.length < 4) S.sel.push(w);
    sync();
  });

  btn.deselect.onclick = () => { S.sel = []; sync(); };

  btn.shuffle.onclick = () => {
    const order = remaining();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.forEach((t) => grid.appendChild(t));
    if (!reduced()) order.forEach((t, i) => anim(t, [{ transform: 'rotateY(90deg) scale(.9)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 200, delay: (i % 4) * 20, easing: 'ease-out', fill: 'backwards' }));
  };

  btn.submit.onclick = async () => {
    if (S.sel.length !== 4 || S.busy || S.over) return;
    const words = S.sel.slice();
    const key = words.slice().sort().join('|');
    if (S.guesses.some((g) => g.words.slice().sort().join('|') === key)) return toast('You tried that. Focus.');
    S.busy = true; sync();
    let out;
    try {
      const res = await fetch('/api/plays/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId: id, words }),
      });
      if (!res.ok) throw new Error(res.status);
      out = await res.json();
    } catch {
      S.busy = false; sync();
      return toast('Network hiccup. Try again.');
    }
    S.busy = false;
    S.guesses.push({ words, result: out.result, group: out.group || null });

    if (out.result === 'correct') {
      S.sel = [];
      solve(out.group, true);
      save();
      if (S.solved.length === 4) return finish(true);
      return toast(PRAISE[S.solved.length - 1]);
    }
    S.mistakes++;
    sync();
    const gone = dots[LIVES - S.mistakes];
    if (!reduced()) {
      anim(gone, [{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 300 });
      anim(grid, [0, -8, 8, -8, 8, -5, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 380 });
    }
    save();
    if (S.mistakes >= LIVES) return finish(true);
    toast(out.result === 'one_away' ? 'One away. Painful.' : 'Not even close.');
  };

  // ---------- restore a saved game ----------
  const saved = store.get(KEY, null);
  if (saved && Array.isArray(saved.guesses)) {
    for (const g of saved.guesses) {
      if (!tiles[g.words && g.words[0]]) continue;
      S.guesses.push(g);
      if (g.result === 'correct' && g.group) solve(g.group, false);
      else S.mistakes++;
    }
    S.posted = !!saved.posted;
    S.solution = saved.solution || null;
    if (S.solved.length === 4 || S.mistakes >= LIVES) finish(false);
  }
  sync();
})();
