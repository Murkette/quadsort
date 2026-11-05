#!/usr/bin/env node
// The formatter: four themes in, the hardest fair puzzle out.
//   node scripts/make-puzzle.js puzzles/some-file.json [--count 3]
//
// The file is { title, description, tags, featured, id?, themes: [four of them], fakes?: [{ name, words }] }.
// A theme is { name, words: [true members, four or more], bait: [words that only look like members] }.
//   - A word that truly fits two themes MUST be in both `words` lists, or the fairness check is blind to it.
//   - Themes run Gentle -> Devious in file order. List your favorite words first: ties go to the earlier ones.
//   - A fake is a theme that is not an answer (say, "body parts" spread across three real groups).
// House style, from 67 real Connections puzzles (Aug to Nov 2026): group 1 is plain meaning (synonyms, a set);
// proper nouns and jargon sit at 3; group 4 is wordplay (fill-in phrase, hidden word, changed letter, sound-alike).
// The usual trap is a word that fits a rival group, so an easy-looking group has five or six candidates.
// Hardest = most traps: words on the board that fit, or look like they fit, a group they are not in.
// Fair    = exactly one way to split the sixteen words into the four themes.
const crypto = require('crypto');
const { validate } = require('../public/js/validate');

const key = (w) => String(w).trim().toLowerCase();

function combos(a, k = 4, start = 0, cur = [], out = []) {
  if (cur.length === k) { out.push(cur.slice()); return out; }
  for (let i = start; i <= a.length - (k - cur.length); i++) { cur.push(a[i]); combos(a, k, i + 1, cur, out); cur.pop(); }
  return out;
}

// Ways to split `board` into four groups of four, each made only of that theme's true members. Stops at 2.
function solutions(board, members, t = 0) {
  if (t === 4) return 1;
  let n = 0;
  for (const pick of combos(board.filter((w) => members[t].has(w)))) {
    n += solutions(board.filter((w) => !pick.includes(w)), members, t + 1);
    if (n > 1) break;
  }
  return n;
}

function make(spec, count = 1) {
  const themes = spec && spec.themes;
  if (!Array.isArray(themes) || themes.length !== 4) throw new Error('Give exactly four themes.');
  const words = themes.map((t) => [...new Map((t.words || []).map((w) => [key(w), String(w).trim()])).values()]);
  words.forEach((w, i) => { if (w.length < 4) throw new Error(`"${themes[i].name}" needs at least four words.`); });
  const members = words.map((w) => new Set(w.map(key)));
  const fakes = spec.fakes || [];
  const lure = [...themes.map((t, i) => new Set([...members[i], ...(t.bait || []).map(key)])), ...fakes.map((f) => new Set(f.words.map(key)))];
  // Each choice of four knows how many traps it sets for the other themes and the fakes.
  const pools = words.map((w, t) => combos(w).map((c) => {
    const k = c.map(key);
    return { c, k, out: k.reduce((n, x) => n + lure.filter((l, i) => i !== t && l.has(x)).length, 0) };
  }));
  // ponytail: brute force over every choice of four per theme; fine for pools up to about ten words. Sample if it ever needs more.
  if (pools.reduce((n, p) => n * p.length, 1) > 2e7) throw new Error('Too many combinations. Trim a word pool.');

  const best = []; // top `count`, hardest first; ties keep the earlier find
  for (const a of pools[0]) for (const b of pools[1]) for (const c of pools[2]) for (const d of pools[3]) {
    const traps = a.out + b.out + c.out + d.out;
    if (best.length === count && traps <= best[count - 1].traps) continue;
    const board = [...a.k, ...b.k, ...c.k, ...d.k];
    if (new Set(board).size !== 16 || solutions(board, members) !== 1) continue;
    const fits = lure.map((l, t) => board.filter((w, i) => (i >> 2) !== t && l.has(w))); // traps aimed at each theme
    best.push({ groups: [a.c, b.c, c.c, d.c], traps, fits });
    best.sort((x, y) => y.traps - x.traps);
    best.length = Math.min(best.length, count);
  }
  if (!best.length) throw new Error('No fair puzzle here: every choice of words has more than one solution. Remove a shared word.');

  return best.map(({ groups, traps, fits }) => {
    const puzzle = {
      id: spec.id || crypto.createHash('sha1').update(String(spec.title)).digest('hex').slice(0, 8),
      title: spec.title, description: spec.description || '', tags: spec.tags || [], featured: spec.featured ? 1 : 0,
      groups: groups.map((w, i) => ({ level: i + 1, name: themes[i].name, words: w })),
    };
    const v = validate(puzzle);
    if (!v.ok) throw new Error(`${spec.title}: ${v.errors.map((e) => e.msg).join(' | ')}`);
    const shown = (k) => groups.flat().find((w) => key(w) === k);
    return { puzzle, traps, report: [...themes, ...fakes].map((t, i) => ({ theme: t.name, alsoLooksLike: fits[i].map(shown) })) };
  });
}

module.exports = { make, solutions };

if (require.main === module) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--count');
  const count = at < 0 ? 1 : Number(args.splice(at, 2)[1]) || 1;
  if (!args[0]) { console.error('usage: node scripts/make-puzzle.js <themes.json> [--count N]'); process.exit(1); }
  try {
    for (const r of make(JSON.parse(require('fs').readFileSync(args[0], 'utf8')), count)) {
      console.log(`\n${r.puzzle.title}  (${r.traps} traps)`);
      r.puzzle.groups.forEach((g, i) => console.log(`  ${g.level}. ${g.name}: ${g.words.join(', ')}`
        + (r.report[i].alsoLooksLike.length ? `   <- also tempting: ${r.report[i].alsoLooksLike.join(', ')}` : '')));
      r.report.slice(4).forEach((f) => console.log(`  fake "${f.theme}": ${f.alsoLooksLike.join(', ') || 'none on the board'}`));
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}
