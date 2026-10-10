// Finding puzzles: search, topic filter, sort, paging. Shared by /browse and the landing page.
const { difficulty } = require('./stats');
const { TAGS, clean } = require('../public/js/validate');

// Whitelisted, so a sort value from the URL never reaches the SQL text.
const SORTS = {
  trending: 'recent DESC, plays DESC, p.created_at DESC',
  new: 'p.created_at DESC',
  plays: 'plays DESC, p.created_at DESC',
};
const PER_PAGE = 24;
const tagLike = (id) => `%,${id},%`;
const escapeLike = (s) => '%' + s.replace(/[\\%_]/g, '\\$&') + '%';
const tagLabel = (tags) => { const t = TAGS.find((x) => x.id === String(tags).split(',')[0]); return t ? t.label : null; };

// ponytail: the per-puzzle play totals are one GROUP BY over all plays on every request. Fine into the
// hundreds of thousands of plays; past that, cache this page for a minute or keep counters on puzzles.
function search(db, opts = {}) {
  const q = clean(opts.q).slice(0, 60);
  const sort = SORTS[opts.sort] ? opts.sort : 'trending';
  const tag = TAGS.some((t) => t.id === opts.tag) ? opts.tag : '';
  const per = opts.per || PER_PAGE;

  const where = ['p.is_published = 1', 'p.is_flagged = 0'];
  const args = [];
  if (tag) { where.push("(',' || p.tags || ',') LIKE ?"); args.push(tagLike(tag)); }
  if (q) {
    const any = ["p.title LIKE ? ESCAPE '\\'", "u.display_name LIKE ? ESCAPE '\\'", "u.username LIKE ? ESCAPE '\\'"];
    args.push(escapeLike(q), escapeLike(q), escapeLike(q));
    for (const t of TAGS) { // typing "food" or "pop" finds the topic too
      if (t.label.toLowerCase().includes(q.toLowerCase())) { any.push("(',' || p.tags || ',') LIKE ?"); args.push(tagLike(t.id)); }
    }
    where.push('(' + any.join(' OR ') + ')');
  }
  const from = `FROM puzzles p LEFT JOIN users u ON u.id = p.user_id WHERE ${where.join(' AND ')}`;

  const total = db.prepare(`SELECT COUNT(*) n ${from}`).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(Math.max(parseInt(opts.page, 10) || 1, 1), pages);
  const week = Math.floor(Date.now() / 1000) - 7 * 86400;

  const rows = db.prepare(`
    SELECT p.id, p.title, p.tags, p.created_at, u.username, u.display_name,
           COALESCE(s.plays, 0) plays, COALESCE(s.wins, 0) wins, COALESCE(r.recent, 0) recent
    FROM puzzles p LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN (SELECT puzzle_id, COUNT(*) plays, SUM(won) wins FROM plays GROUP BY puzzle_id) s ON s.puzzle_id = p.id
    LEFT JOIN (SELECT puzzle_id, COUNT(*) recent FROM plays WHERE created_at > ? GROUP BY puzzle_id) r ON r.puzzle_id = p.id
    WHERE ${where.join(' AND ')} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`)
    .all(week, ...args, per, (page - 1) * per)
    .map((r) => {
      const solveRate = r.plays ? r.wins / r.plays : null;
      return { id: r.id, title: r.title, plays: r.plays, solveRate, diff: difficulty({ plays: r.plays, solveRate }),
        by: r.display_name || 'Quadsort', tag: tagLabel(r.tags) };
    });
  return { rows, total, page, pages, q, sort, tag };
}

module.exports = { search, SORTS, PER_PAGE };
