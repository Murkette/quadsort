// Dashboard actions: copy a puzzle link, delete a puzzle.
document.addEventListener('click', async (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    const ok = await QS.copy(location.origin + copy.dataset.copy);
    const was = copy.textContent;
    copy.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => (copy.textContent = was), 1800);
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
