// Small helpers shared by the play, results and create pages.
window.QS = {
  // localStorage that never throws (private mode, blocked storage)
  store: {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* play on */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  },
  // Shrink a tile's word until it fits; if it still can't at a readable size, let it wrap mid-word
  // rather than clip. Starting sizes come from CSS by word length.
  fit(el) {
    el.classList.remove('brk');
    const over = () => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
    const shrink = (floor) => {
      el.style.fontSize = '';
      let s = parseFloat(getComputedStyle(el).fontSize);
      while (over() && s > floor) { s -= 0.5; el.style.fontSize = s + 'px'; }
    };
    shrink(10);
    if (over()) { el.classList.add('brk'); shrink(9); }
  },
  // Clipboard with a fallback for insecure contexts and older in-app browsers.
  async copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  },
};
