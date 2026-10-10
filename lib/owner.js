// Anonymous ownership: a random cookie per browser. Lets a creator edit their puzzles before
// accounts exist; signup will later claim every puzzle carrying this key.
const crypto = require('crypto');

const read = (req) => (/(?:^|;\s*)qs_owner=([\w-]{20,64})/.exec(req.headers.cookie || '') || [])[1] || null;

function ensure(req, res) {
  let key = read(req);
  if (!key) {
    key = crypto.randomBytes(24).toString('base64url');
    res.cookie('qs_owner', key, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 2 * 365 * 24 * 3600 * 1000,
    });
  }
  return key;
}

module.exports = { read, ensure };
