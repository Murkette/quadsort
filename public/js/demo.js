// Landing page warm-up: a tiny two-group puzzle that runs entirely in the browser (no answers to protect here).
(() => {
  const root = document.getElementById('demo');
  if (!root) return;
  const G = [
    { name: 'Planets', level: 2, words: ['VENUS', 'SATURN', 'JUPITER', 'EARTH'] },
    { name: 'Chocolate bars', level: 3, words: ['MARS', 'GALAXY', 'TWIX', 'BOUNTY'] },
  ];
  const ORDER = ['MARS', 'VENUS', 'TWIX', 'GALAXY', 'EARTH', 'BOUNTY', 'SATURN', 'JUPITER'];
  const grid = root.querySelector('#demo-grid'), rows = root.querySelector('#demo-rows');
  const toastEl = root.querySelector('#demo-toast');
  let sel = [], solved = 0, busy = false, tt;

  const tiles = Object.fromEntries(ORDER.map((w) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile len' + (w.length <= 5 ? 1 : 2);
    b.textContent = w;
    b.dataset.w = w;
    b.setAttribute('aria-pressed', 'false');
    grid.append(b);
    return [w, b];
  }));

  const fitAll = () => Object.values(tiles).forEach(QS.fit);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(fitAll);
  addEventListener('resize', fitAll);

  const say = (msg) => {
    clearTimeout(tt);
    toastEl.textContent = msg;
    toastEl.hidden = !msg;
    toastEl.classList.remove('drop'); void toastEl.offsetWidth; toastEl.classList.add('drop');
    if (msg) tt = setTimeout(() => (toastEl.hidden = true), 1600);
  };

  const check = () => {
    const g = G.find((x) => x.words.includes(sel[0]));
    const hits = sel.filter((w) => g.words.includes(w)).length;
    if (hits === 4) {
      g.words.forEach((w) => { tiles[w].remove(); delete tiles[w]; });
      const row = document.createElement('div');
      row.className = 'row lv pop';
      row.dataset.level = g.level;
      row.innerHTML = '<div class="name"><span class="shape" aria-hidden="true"></span><span class="label"></span></div><div class="words"></div>';
      row.querySelector('.shape').dataset.level = g.level;
      row.querySelector('.label').textContent = g.name;
      row.querySelector('.words').textContent = g.words.join(', ');
      rows.append(row);
      solved++;
      if (solved === 2) {
        say('');
        grid.hidden = true;
        root.querySelector('#demo-hint').hidden = true;
        root.querySelector('#demo-done').hidden = false;
      } else say('Sorted. Smug yet?');
    } else {
      say(hits === 3 || hits === 1 ? 'One away. Painful.' : 'Not even close.');
      grid.classList.remove('shake'); void grid.offsetWidth; grid.classList.add('shake');
    }
    sel = [];
    Object.values(tiles).forEach((t) => t.setAttribute('aria-pressed', 'false'));
    busy = false;
  };

  grid.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t || busy) return;
    const w = t.dataset.w;
    sel = sel.includes(w) ? sel.filter((x) => x !== w) : [...sel, w];
    t.setAttribute('aria-pressed', sel.includes(w));
    if (sel.length === 4) { busy = true; setTimeout(check, 260); } // brief pause so the fourth tile visibly lands
  });
})();
