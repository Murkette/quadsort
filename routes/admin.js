// Moderation. Admin-only; to anyone else this whole area does not exist (404).
const express = require('express');
const { escapeLike } = require('../lib/browse');
const { safeNext } = require('../lib/auth');
const { REASONS } = require('../lib/reports');
const { clean } = require('../public/js/validate');

const PER_PAGE = 30;

module.exports = (db) => {
  const r = express.Router();
  r.use((req, res, next) => {
    if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl)); // so a real admin can sign in
    req.user.is_admin ? next() : next('router');                                              // anyone else: 404
  });

  const count = (sql, ...a) => db.prepare(sql).get(...a).n;
  const queue = db.prepare(`
    SELECT p.id, p.title, p.is_flagged, p.is_featured, u.username, u.display_name, COUNT(*) n, MAX(rp.created_at) last
    FROM reports rp JOIN puzzles p ON p.id = rp.puzzle_id LEFT JOIN users u ON u.id = p.user_id
    WHERE rp.resolved = 0 GROUP BY p.id ORDER BY n DESC, last DESC LIMIT 100`);
  const reasonsOf = db.prepare('SELECT reason, COUNT(*) n FROM reports WHERE puzzle_id = ? AND resolved = 0 GROUP BY reason ORDER BY n DESC');
  const notesOf = db.prepare("SELECT note FROM reports WHERE puzzle_id = ? AND resolved = 0 AND note != '' ORDER BY created_at DESC LIMIT 5");

  r.get('/', (req, res) => {
    const tab = req.query.tab === 'puzzles' ? 'puzzles' : 'reports';
    const q = clean(req.query.q).slice(0, 60);
    const stats = {
      puzzles: count('SELECT COUNT(*) n FROM puzzles'), hidden: count('SELECT COUNT(*) n FROM puzzles WHERE is_flagged = 1'),
      featured: count('SELECT COUNT(*) n FROM puzzles WHERE is_featured = 1'),
      reported: count('SELECT COUNT(DISTINCT puzzle_id) n FROM reports WHERE resolved = 0'),
    };
    const out = { title: 'Admin', noindex: true, tab, q, stats, REASONS, back: req.originalUrl, reports: [], list: [], page: 1, pages: 1, total: 0 };

    if (tab === 'reports') {
      out.reports = queue.all().map((p) => ({ ...p, reasons: reasonsOf.all(p.id), notes: notesOf.all(p.id).map((x) => x.note) }));
    } else {
      const like = escapeLike(q);
      const where = q ? "WHERE p.title LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\'" : '';
      const args = q ? [like, like, like] : [];
      out.total = count(`SELECT COUNT(*) n FROM puzzles p LEFT JOIN users u ON u.id = p.user_id ${where}`, ...args);
      out.pages = Math.max(1, Math.ceil(out.total / PER_PAGE));
      out.page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), out.pages);
      out.list = db.prepare(`
        SELECT p.id, p.title, p.is_flagged, p.is_featured, p.created_at, u.username, u.display_name,
               (SELECT COUNT(*) FROM plays WHERE puzzle_id = p.id) plays,
               (SELECT COUNT(*) FROM reports WHERE puzzle_id = p.id AND resolved = 0) open_reports
        FROM puzzles p LEFT JOIN users u ON u.id = p.user_id ${where}
        ORDER BY p.created_at DESC LIMIT ? OFFSET ?`).all(...args, PER_PAGE, (out.page - 1) * PER_PAGE);
    }
    res.render('admin', out);
  });

  // Hiding also un-features (a hidden puzzle should not be a staff pick) and closes its reports: action was taken.
  const resolve = db.prepare('UPDATE reports SET resolved = 1 WHERE puzzle_id = ?');
  const actions = {
    feature: (id) => db.prepare('UPDATE puzzles SET is_featured = 1 WHERE id = ? AND is_flagged = 0').run(id),
    unfeature: (id) => db.prepare('UPDATE puzzles SET is_featured = 0 WHERE id = ?').run(id),
    hide: (id) => { db.prepare('UPDATE puzzles SET is_flagged = 1, is_featured = 0 WHERE id = ?').run(id); resolve.run(id); },
    unhide: (id) => db.prepare('UPDATE puzzles SET is_flagged = 0 WHERE id = ?').run(id),
    dismiss: (id) => resolve.run(id),
  };
  r.post('/puzzles/:id', express.urlencoded({ extended: false, limit: '2kb' }), (req, res, next) => {
    const act = Object.hasOwn(actions, req.body.action) && actions[req.body.action];
    if (!act || !count('SELECT COUNT(*) n FROM puzzles WHERE id = ?', req.params.id)) return next('router');
    db.transaction(() => act(req.params.id))();
    res.redirect(safeNext(req.body.back, '/admin'));
  });

  return r;
};
