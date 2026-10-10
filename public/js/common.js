// Small helpers shared by the play, results and create pages.
window.QS = {
  // localStorage that never throws (private mode, blocked storage)
  store: {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* play on */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
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
