// Dashboard actions: copy a puzzle link, join or leave the Daily line, delete a puzzle.
document.addEventListener('click', async (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    const ok = await QS.copy(location.origin + copy.dataset.copy);
    const was = copy.textContent;
    copy.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => (copy.textContent = was), 1800);
    return;
  }
  const dly = e.target.closest('[data-daily]');
  if (dly) {
    dly.disabled = true;
    const res = await fetch(`/api/puzzles/${dly.dataset.id}/daily`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ in: dly.dataset.daily === 'join' }) }).catch(() => null);
    if (res && res.ok) location.reload(); else { dly.disabled = false; alert('Could not change that. Try again.'); }
    return;
  }
  const del = e.target.closest('[data-delete]');
  if (del && confirm(`Delete “${del.dataset.title}”? Its plays and stats go with it. This can't be undone.`)) {
    del.disabled = true;
    const res = await fetch('/api/puzzles/' + del.dataset.delete, { method: 'DELETE' }).catch(() => null);
    if (res && res.ok) location.reload();
    else { del.disabled = false; alert('Could not delete that. Try again.'); }
  }
});
