// Tells a creator their puzzle was picked as a Daily. House puzzles have no creator, so nothing is sent.
const { send, dailyEmail } = require('./mail');
const { siteUrl } = require('./util');
const { label } = require('./daily');

module.exports = (db) => {
  const who = db.prepare(`SELECT u.email, u.display_name AS name, p.title FROM puzzles p JOIN users u ON u.id = p.user_id WHERE p.id = ?`);
  return async function notify(d) {
    if (!d.userId) return;
    const u = who.get(d.puzzleId);
    if (!u) return;
    await send({ to: u.email, ...dailyEmail({ name: u.name, title: u.title, number: d.number, label: label(d.day), link: `${siteUrl()}/p/${d.puzzleId}` }) });
  };
};
