// Theme switch: Auto follows the device, Light and Dark override it. The saved choice is applied by a
// tiny inline script in <head> before first paint, so there is no flash of the wrong theme.
(() => {
  const group = document.querySelector('.theme');
  if (!group) return;
  const root = document.documentElement, KEY = 'qs:theme';
  const saved = () => { try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; } };
  const apply = (t) => {
    if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
  };
  group.hidden = false; // without JavaScript the buttons would do nothing, so they start hidden
  apply(saved());
  group.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]');
    if (!b) return;
    const t = b.dataset.themeSet;
    try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* private mode: lasts this page only */ }
    apply(t);
  });
})();
