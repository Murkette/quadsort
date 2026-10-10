const crypto = require('crypto');

const MAX_MISTAKES = 4;

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Judge one guess against the solution. null = malformed (not 4 distinct words from this puzzle).
function check(groups, words) {
  if (!Array.isArray(words) || words.length !== 4 || new Set(words).size !== 4) return null;
  const owners = words.map((w) => groups.findIndex((g) => g.words.includes(w)));
  if (owners.includes(-1)) return null;
  const counts = [0, 0, 0, 0];
  owners.forEach((i) => counts[i]++);
  const best = Math.max(...counts);
  if (best === 4) return { result: 'correct', group: groups[owners[0]] };
  return { result: best === 3 ? 'one_away' : 'wrong' };
}

// Replay a finished game's guesses. Returns {won, mistakes}, or null if the list
// is not a genuine finished game. This is what stops "I lost, show me the answers".
function replay(groups, guesses) {
  if (!Array.isArray(guesses) || guesses.length > 8) return null;
  const solved = new Set();
  const seen = new Set();
  let mistakes = 0;
  for (const words of guesses) {
    if (mistakes >= MAX_MISTAKES || solved.size === 4) return null;
    const r = check(groups, words);
    if (!r) return null;
    const key = [...words].sort().join('|');
    if (seen.has(key)) return null;
    seen.add(key);
    if (r.result === 'correct') {
      if (solved.has(r.group)) return null;
      solved.add(r.group);
    } else mistakes++;
  }
  if (solved.size === 4) return { won: true, mistakes };
  if (mistakes === MAX_MISTAKES) return { won: false, mistakes };
  return null;
}

const bySolution = (groups) => groups.slice().sort((a, b) => a.level - b.level);

module.exports = { shuffle, check, replay, bySolution, MAX_MISTAKES };
