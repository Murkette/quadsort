const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join('').toUpperCase();

// Only http(s) links are ever rendered, so a stored javascript: URL can't become a link.
function linkInfo(url) {
  if (!/^https?:\/\//i.test(url || '')) return { social: null, host: null, handle: null };
  const u = new URL(url);
  const seg = u.pathname.split('/').filter(Boolean).pop(); // instagram.com/priyamakes -> @priyamakes
  return { social: url, host: u.hostname.replace(/^www\./, ''), handle: seg ? '@' + seg.replace(/^@/, '') : null };
}

module.exports = { initials, linkInfo };
