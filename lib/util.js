const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join('').toUpperCase();

// Only http(s) links are ever rendered, so a stored javascript: URL can't become a link.
function linkInfo(url) {
  if (!/^https?:\/\//i.test(url || '')) return { social: null, host: null, handle: null };
  const u = new URL(url);
  const seg = u.pathname.split('/').filter(Boolean).pop(); // instagram.com/priyamakes -> @priyamakes
  return { social: url, host: u.hostname.replace(/^www\./, ''), handle: seg ? '@' + seg.replace(/^@/, '') : null };
}

// One line about where a puzzle stands with the Daily (see lib/daily.js info()).
function dailyLine(i) {
  if (i.state === 'queued') return `In line for the Daily. ${i.daysAway <= 0 ? 'It runs today.' : i.daysAway === 1 ? 'It runs tomorrow.' : `About ${i.daysAway} days away.`}`;
  if (i.state === 'today') return `Today's Daily, #${i.number}.`;
  if (i.state === 'was') return `Was Daily #${i.number} on ${i.short}.`;
  if (i.state === 'scheduled') return `Scheduled as Daily #${i.number} on ${i.short}.`;
  return '';
}

// The site's public address for things that have no request to ask (emails, the nightly job).
const siteUrl = () => process.env.SITE_URL || (process.env.NODE_ENV === 'production' ? 'https://quadsort.com' : `http://127.0.0.1:${process.env.PORT || 3000}`);

module.exports = { initials, linkInfo, dailyLine, siteUrl };
