// Results panel. Listens for play.js finishing a game; everything shown comes from that event
// (solution + stats from the server), so nothing about the answers is in the page before then.
(() => {
  const root = document.getElementById('results');
  const play = document.querySelector('.play');
  if (!root || !play) return;
  const $ = (s) => root.querySelector(s);
  const EMOJI = ['🟨', '🟦', '🟧', '🟪']; // levels 1-4
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  let data, shareText = '';

  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const shape = (level) => { const s = h('span', 'shape'); s.dataset.level = level; s.setAttribute('aria-hidden', 'true'); return s; };

  function render(d) {
    const level = {};
    d.solution.forEach((g) => g.words.forEach((w) => (level[w] = g.level)));
    const rows = d.guesses.map((ws) => ws.map((w) => level[w]).sort());
    const found = d.found.length;

    $('#r-head').textContent = d.won ? 'Sorted.' : 'Sort yourself out.';
    $('#r-sub').textContent = d.won
      ? `All four groups, ${d.mistakes ? plural(d.mistakes, 'mistake') : 'no mistakes'}. Insufferable, frankly.`
      : found ? `${plural(found, 'group')} found. The other ${4 - found} found you.` : 'Not one group. Remarkable.';
    $('#r-score').textContent = d.won ? `4/4 · ${plural(d.mistakes, 'mistake')}` : `${found}/4 · out of lives`;

    const grid = $('#r-grid');
    grid.replaceChildren(...rows.map((r) => {
      const line = h('div');
      r.forEach((lv) => { const sq = h('span', 'sq lv'); sq.dataset.level = lv; sq.append(shape(lv)); line.append(sq); });
      return line;
    }));
    const right = d.guesses.length - d.mistakes;
    grid.setAttribute('aria-label', `${plural(d.guesses.length, 'guess')}: ${right} correct, ${d.mistakes} wrong`);

    const url = `${location.origin}/p/${d.id}`;
    $('#r-url').textContent = url.replace(/^https?:\/\//, '');
    shareText = [`Quadsort — "${document.querySelector('.puzzle-head h1').textContent}"`,
      ...rows.map((r) => r.map((lv) => EMOJI[lv - 1]).join('')), url].join('\n');

    $('#r-answers').replaceChildren(...d.solution.map((g) => {
      const got = d.found.includes(g.name);
      const row = h('div', 'row lv' + (got ? '' : ' revealed'));
      row.dataset.level = g.level;
      const name = h('div', 'name');
      name.append(shape(g.level), h('span', '', g.name), h('span', 'tag', got ? 'Found' : 'Missed'));
      row.append(name, h('div', 'words', g.words.join(', ')));
      return row;
    }));

    stats(d);
  }

  function stats(d) {
    const st = d.stats;
    $('#r-stats').hidden = !st || !st.plays;
    if (!st || !st.plays) return;
    const mine = d.won ? d.mistakes : 4;
    $('#s-rate').textContent = Math.round(st.solveRate * 100) + '%';
    $('#s-avg').textContent = st.avgMistakes.toFixed(1);
    $('#s-you').textContent = d.won ? String(d.mistakes) : 'Lost';
    const pct = st.dist.map((n) => Math.round((n / st.plays) * 100));
    const top = Math.max(...pct, 1);
    $('#s-dist').replaceChildren(...['0 mistakes', '1 mistake', '2 mistakes', '3 mistakes', 'Lost'].map((label, i) => {
      const row = h('div', 'drow' + (i === mine ? ' mine' : ''));
      const bar = h('span', 'bar');
      bar.setAttribute('aria-hidden', 'true'); // the percentage beside it says the same thing
      bar.style.width = (pct[i] / top) * 100 + '%';
      const track = h('span', 'track'); track.append(bar);
      const name = h('span', '', label);
      if (i === mine) name.append(h('span', 'sr', ' (your result)')); // the highlight is colour only
      row.append(name, track, h('span', 'pct', pct[i] + '%'));
      return row;
    }));
    const worse = st.dist.reduce((a, n, i) => (i > mine ? a + n : a), 0); // players who did worse than you
    $('#s-verdict').textContent = st.plays < 5
      ? `Early days: only ${plural(st.plays, 'person')} ${st.plays === 1 ? 'has' : 'have'} played this. Tell your friends.`
      : !d.won ? `You’re with the ${pct[4]}% who didn’t make it. Big club. Not a good one.`
      : worse ? `You beat ${Math.round((worse / st.plays) * 100)}% of players. Don’t let it go to your head.`
      : 'Joint best. Nobody did better. Allegedly.';
    const w = $('#s-wrong');
    w.hidden = !st.topWrong;
    if (st.topWrong) w.textContent = `Most common wrong guess: ${st.topWrong.words.join(', ')}.`;
  }

  // Swapping views changes the whole page, so move focus into the new one (or screen reader users are left on a vanished button).
  const show = () => { play.hidden = true; root.hidden = false; scrollTo(0, 0); const h = $('#r-head'); h.tabIndex = -1; h.focus({ preventScroll: true }); };
  const hide = () => {
    root.hidden = true; play.hidden = false; scrollTo(0, 0);
    const b = document.querySelector('[data-act="results"]');
    if (b) b.focus({ preventScroll: true });
  };

  let t;
  $('#copy').onclick = async () => {
    const btn = $('#copy'), label = $('#copy-label');
    const ok = await QS.copy(shareText);
    label.textContent = ok ? 'Copied' : 'Copy failed';
    btn.classList.toggle('done', ok);
    clearTimeout(t);
    t = setTimeout(() => { label.textContent = 'Copy result'; btn.classList.remove('done'); }, 1800);
  };
  $('#back').onclick = hide;
  document.addEventListener('click', (e) => { if (data && e.target.closest('[data-act="results"]')) show(); });
  addEventListener('qs:finished', (e) => { data = e.detail; render(data); if (data.auto) show(); });
})();
