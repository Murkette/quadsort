// Puzzle rules, shared: the browser uses this for live feedback, the server for the real check.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QSValidate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LIMITS = { title: 60, description: 140, name: 40, group: 40, word: 14, link: 200, tags: 3 };
  const LEVELS = ['Gentle', 'Tricky', 'Sneaky', 'Devious'];
  const TAGS = [
    { id: 'pop-culture', label: 'Pop culture' }, { id: 'sport', label: 'Sport' },
    { id: 'food', label: 'Food & drink' }, { id: 'music', label: 'Music' },
    { id: 'tv-film', label: 'TV & film' }, { id: 'gaming', label: 'Gaming' },
    { id: 'fandom', label: 'Fandoms' }, { id: 'science', label: 'Science' },
    { id: 'history', label: 'History' }, { id: 'wordplay', label: 'Wordplay' },
  ];

  // trim, collapse whitespace, drop control characters
  const clean = (s) => (typeof s === 'string' || typeof s === 'number'
    ? String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '');

  // '' = none, null = not a usable link. Adds https:// when the scheme is missing; http(s) only.
  function normUrl(s) {
    s = clean(s);
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    try {
      const u = new URL(s);
      return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : null;
    } catch { return null; }
  }

  // tone: 'err' = wrong, 'warn' = too long, 'missing' = just not filled in yet
  function validate(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const errors = [];
    const bad = (field, msg, tone = 'err') => errors.push({ field, msg, tone });

    const title = clean(raw.title), description = clean(raw.description), creatorName = clean(raw.creatorName);
    if (!title) bad('title', 'Give it a title.', 'missing');
    else if (title.length > LIMITS.title) bad('title', `Title is too long (${title.length}/${LIMITS.title}).`, 'warn');
    if (!creatorName) bad('creatorName', 'Credit yourself. You earned it.', 'missing');
    else if (creatorName.length > LIMITS.name) bad('creatorName', `Name is too long (${creatorName.length}/${LIMITS.name}).`, 'warn');
    if (description.length > LIMITS.description) bad('description', `Description is too long (${description.length}/${LIMITS.description}).`, 'warn');

    const linkRaw = clean(raw.link);
    const link = normUrl(linkRaw);
    if (link === null) bad('link', "That doesn't look like a link.");
    else if (link.length > LIMITS.link) bad('link', 'That link is too long.', 'warn');

    const tags = Array.isArray(raw.tags) ? [...new Set(raw.tags)] : [];
    if (tags.some((t) => !TAGS.some((x) => x.id === t))) bad('tags', 'Unknown topic.');
    if (tags.length > LIMITS.tags) bad('tags', `Pick up to ${LIMITS.tags} topics.`, 'warn');

    const gs = Array.isArray(raw.groups) ? raw.groups : [];
    if (gs.length !== 4) bad('groups', 'A puzzle needs exactly four groups.');
    const words = new Set(), names = new Set(), levels = new Set();
    const groups = gs.slice(0, 4).map((g, i) => {
      g = g && typeof g === 'object' ? g : {};
      const name = clean(g.name), level = Number(g.level);
      if (!Number.isInteger(level) || level < 1 || level > 4) bad(`g${i}.level`, 'Pick a difficulty.');
      else if (levels.has(level)) bad(`g${i}.level`, 'Each group needs its own difficulty.');
      else levels.add(level);
      if (!name) bad(`g${i}.name`, 'Give this group a name. Players see it when they solve it.', 'missing');
      else if (name.length > LIMITS.group) bad(`g${i}.name`, `Group name is too long (${name.length}/${LIMITS.group}).`, 'warn');
      else if (names.has(name.toLowerCase())) bad(`g${i}.name`, `Two groups can't both be called ${name}.`);
      if (name) names.add(name.toLowerCase());
      const ws = Array.isArray(g.words) ? g.words : [];
      if (ws.length !== 4) bad(`g${i}`, 'Each group needs exactly four words.');
      return {
        name, level,
        words: [0, 1, 2, 3].map((j) => {
          const w = clean(ws[j]);
          if (!w) { bad(`g${i}.w${j}`, 'Word missing.', 'missing'); return w; }
          const shown = w.toUpperCase();
          if (w.length > LIMITS.word) bad(`g${i}.w${j}`, `${shown} is too long for a tile (${w.length}/${LIMITS.word}).`, 'warn');
          if (words.has(w.toLowerCase())) bad(`g${i}.w${j}`, `${shown} is already used. Pick another.`);
          words.add(w.toLowerCase());
          return w;
        }),
      };
    });

    return {
      ok: !errors.length, errors,
      value: { title, description, creatorName, link: link || '', tags, groups: groups.slice().sort((a, b) => a.level - b.level) },
    };
  }

  return { LIMITS, LEVELS, TAGS, clean, normUrl, validate };
});
