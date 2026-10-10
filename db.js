// Opens SQLite and applies migrations/*.sql in filename order (tracked by PRAGMA user_version).
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

module.exports = function open(file = process.env.DB_PATH || 'quadsort.db') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = db.pragma('user_version', { simple: true });
  files.slice(done).forEach((f, i) => {
    db.transaction(() => {
      db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      db.pragma(`user_version = ${done + i + 1}`);
    })();
  });
  return db;
};
