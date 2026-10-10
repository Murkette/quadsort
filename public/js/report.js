// "Report this puzzle": a small dialog. One report per player per puzzle; a human reviews it.
(() => {
  const dlg = document.getElementById('report-dialog'), open = document.getElementById('report-open');
  const puzzle = document.querySelector('.play');
  if (!dlg || !open || !puzzle) return;
  if (typeof dlg.showModal !== 'function') return open.remove(); // very old browser: no dialog, no button
  const form = document.getElementById('report-form'), msg = document.getElementById('report-msg');
  const thanks = document.getElementById('report-thanks'), send = document.getElementById('report-send');

  open.onclick = () => { form.hidden = false; thanks.hidden = true; msg.hidden = true; dlg.showModal(); };
  document.getElementById('report-cancel').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // click the backdrop

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    send.disabled = true; msg.hidden = true;
    try {
      const res = await fetch(`/api/puzzles/${puzzle.dataset.puzzle}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: form.querySelector('#report-reason').value, note: form.querySelector('#report-note').value, playerKey: QS.playerKey() }),
      });
      if (!res.ok) throw Object.assign(new Error('report failed'), { body: await res.json().catch(() => ({})) });
      form.hidden = true; thanks.hidden = false;
      form.reset();
      setTimeout(() => dlg.open && dlg.close(), 1800);
    } catch (err) {
      msg.textContent = (err.body && err.body.error) || 'Could not send that. Try again.';
      msg.hidden = false;
    } finally { send.disabled = false; }
  });
})();
