CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT,
  social_url    TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE puzzles (
  id           TEXT PRIMARY KEY,            -- 8-char base62, used in /p/:id
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  groups_json  TEXT NOT NULL,               -- [{name, level 1-4, words[4]}] x4
  tags         TEXT NOT NULL DEFAULT '',    -- comma list
  is_published INTEGER NOT NULL DEFAULT 1,
  is_featured  INTEGER NOT NULL DEFAULT 0,
  is_flagged   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX puzzles_user ON puzzles(user_id);
CREATE INDEX puzzles_featured ON puzzles(is_featured);

CREATE TABLE plays (
  id           INTEGER PRIMARY KEY,
  puzzle_id    TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  player_key   TEXT NOT NULL,               -- random uuid kept in localStorage
  won          INTEGER NOT NULL,
  mistakes     INTEGER NOT NULL,
  guesses_json TEXT NOT NULL,               -- drives the coloured-square share grid
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX plays_puzzle ON plays(puzzle_id, created_at);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
