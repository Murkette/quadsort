// The Daily. One puzzle per US Eastern day, picked from the line of creators who opted in
// (first in, first out), falling back to house puzzles. Rules and reasoning: DAILY.md.
const ET = 'America/New_York';
const etFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }); // 2026-10-13

const etDay = (ms) => etFormat.format(ms);
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const validDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && addDays(s, 0) === s;
const say = (day, opts) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const label = (day) => say(day, { weekday: 'long', month: 'long', day: 'numeric' });  // Monday, October 13
const short = (day) => say(day, { month: 'short', day: 'numeric' });                  // Oct 13

const COOLDOWN_DAYS = 7; // one creator can't hold two Dailies within a week

function makeDaily(db, { now = Date.now, onPick } = {}) {
  const today = () => etDay(now());
  const live = db.prepare('SELECT 1 FROM puzzles WHERE id = ? AND is_published = 1 AND is_flagged = 0');
  const row = db.prepare('SELECT day, number, puzzle_id AS puzzleId FROM dailies WHERE day = ?');
  const insert = db.prepare('INSERT INTO dailies (day, puzzle_id, number) VALUES (?, ?, ?)');
  const nextNumber = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 n FROM dailies');
  const swap = db.prepare('UPDATE dailies SET puzzle_id = ? WHERE day = ?');
  const holders = db.prepare(`SELECT DISTINCT q.user_id FROM dailies d JOIN puzzles q ON q.id = d.puzzle_id
    WHERE q.user_id IS NOT NULL AND d.day < ? AND d.day > date(?, '-${COOLDOWN_DAYS} days')`);
  // The line: opted in, still live, never yet a Daily. Oldest opt-in first.
  const line = db.prepare(`SELECT p.id, p.title, p.user_id AS userId, p.daily_opt_in_at AS at, u.username, u.display_name AS name
    FROM puzzles p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.daily_opt_in_at IS NOT NULL AND p.is_published = 1 AND p.is_flagged = 0
      AND NOT EXISTS (SELECT 1 FROM dailies d WHERE d.puzzle_id = p.id)
    ORDER BY p.daily_opt_in_at, p.rowid`);
  const houseFresh = db.prepare(`SELECT p.id, p.user_id AS userId FROM puzzles p
    WHERE p.user_id IS NULL AND p.is_published = 1 AND p.is_flagged = 0 AND NOT EXISTS (SELECT 1 FROM dailies d WHERE d.puzzle_id = p.id)
    ORDER BY p.created_at, p.rowid LIMIT 1`);
  const houseOldestRun = db.prepare(`SELECT p.id, p.user_id AS userId FROM puzzles p
    LEFT JOIN (SELECT puzzle_id, MAX(day) last FROM dailies GROUP BY puzzle_id) d ON d.puzzle_id = p.id
    WHERE p.user_id IS NULL AND p.is_published = 1 AND p.is_flagged = 0 ORDER BY d.last, p.created_at, p.rowid LIMIT 1`);
  const latestFor = db.prepare('SELECT day, number FROM dailies WHERE puzzle_id = ? ORDER BY day DESC LIMIT 1');
  const assigned = db.prepare('SELECT 1 FROM dailies WHERE day = ?');

  const decorate = (d) => d && { ...d, label: label(d.day), short: short(d.day), isToday: d.day === today() };

  // Next in line for `day`: the oldest opt-in whose creator has not had a Daily in the last week,
  // else a house puzzle (never run before, then whichever ran longest ago).
  function chooseFor(day) {
    const blocked = new Set(holders.all(day, day).map((r) => r.user_id));
    return line.all().find((p) => !blocked.has(p.userId)) || houseFresh.get() || houseOldestRun.get() || null;
  }

  function announce(d) { // never let a notification problem break the pick
    if (!onPick) return;
    Promise.resolve().then(() => onPick(d)).catch((e) => console.error('daily notification failed:', e.message));
  }

  // Writes the day once. better-sqlite3 is synchronous and the transaction is atomic, so two
  // visitors arriving at the same moment both get the same puzzle.
  function pick(day) {
    let made = null;
    db.transaction(() => {
      if (row.get(day)) return;
      const p = chooseFor(day);
      if (!p) return;
      made = { day, puzzleId: p.id, number: nextNumber.get().n, userId: p.userId };
      insert.run(day, made.puzzleId, made.number);
    })();
    if (made) announce(made);
    return row.get(day) || null;
  }

  return {
    etDay, addDays, validDay, label, short, today,

    forDay: (day) => (validDay(day) && day <= today() ? decorate(row.get(day)) : null),

    // Today's Daily, picking it if nobody has yet. If a moderator hid it meanwhile, swap in another (same number).
    current() {
      const day = today();
      let d = row.get(day);
      if (d && !live.get(d.puzzleId)) {
        const p = chooseFor(day);
        if (p) { swap.run(p.id, day); announce({ day, puzzleId: p.id, number: d.number, userId: p.userId }); d = row.get(day); }
      }
      return decorate(d || pick(day));
    },

    pick, // exposed for the nightly script and for tests

    // The line, with a rough "days away" for each (ignores the one-per-creator pause, hence "about").
    queue() {
      const t = today();
      let cursor = assigned.get(t) ? addDays(t, 1) : t;
      return line.all().map((p, i) => {
        while (assigned.get(cursor)) cursor = addDays(cursor, 1);
        const day = cursor;
        cursor = addDays(cursor, 1);
        return { ...p, position: i + 1, day, daysAway: Math.round((Date.parse(day) - Date.parse(t)) / 86400000) };
      });
    },

    // Where a puzzle stands: never, in line, scheduled, or already run.
    info(puzzleId) {
      const ran = latestFor.get(puzzleId);
      if (ran) {
        const t = today();
        const state = ran.day > t ? 'scheduled' : ran.day === t ? 'today' : 'was';
        return { state, number: ran.number, day: ran.day, label: label(ran.day), short: short(ran.day) };
      }
      const q = this.queue().find((p) => p.id === puzzleId);
      return q ? { state: 'queued', position: q.position, daysAway: q.daysAway } : { state: 'none' };
    },

    // Opt in (keeps an earlier place in line if you were already there). False if it already ran.
    join(puzzleId) {
      if (latestFor.get(puzzleId)) return false;
      return db.prepare('UPDATE puzzles SET daily_opt_in_at = COALESCE(daily_opt_in_at, unixepoch()) WHERE id = ?').run(puzzleId).changes > 0;
    },
    leave: (puzzleId) => db.prepare('UPDATE puzzles SET daily_opt_in_at = NULL WHERE id = ?').run(puzzleId).changes > 0,

    // Admin: make a puzzle tomorrow's Daily, jumping the line. Today's is settled first so numbers stay in order.
    makeTomorrows(puzzleId) {
      this.current();
      if (!live.get(puzzleId)) return null;
      const day = addDays(today(), 1);
      return db.transaction(() => {
        const have = row.get(day);
        if (have) swap.run(puzzleId, day); else insert.run(day, puzzleId, nextNumber.get().n);
        return row.get(day);
      })();
    },
  };
}

module.exports = { makeDaily, etDay, addDays, validDay, label, short, COOLDOWN_DAYS };
