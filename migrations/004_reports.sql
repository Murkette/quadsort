-- Reports from players. A human reviews them; nothing is hidden automatically.
CREATE TABLE reports (
  id           INTEGER PRIMARY KEY,
  puzzle_id    TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  reporter_key TEXT NOT NULL,                -- the player's random localStorage key; one report per player per puzzle
  reason       TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  resolved     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (puzzle_id, reporter_key)
);
CREATE INDEX reports_open ON reports(resolved, puzzle_id);
