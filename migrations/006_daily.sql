-- The Daily: one puzzle everyone plays each (US Eastern) day. See DAILY.md.
ALTER TABLE puzzles ADD COLUMN daily_opt_in_at INTEGER;     -- NULL = not in the rotation; otherwise your place in line
CREATE INDEX puzzles_daily_queue ON puzzles(daily_opt_in_at);

CREATE TABLE dailies (
  day        TEXT PRIMARY KEY,                            -- '2026-10-13', Eastern time
  puzzle_id  TEXT NOT NULL REFERENCES puzzles(id),        -- not CASCADE: a Daily is archive, so it can't be deleted
  number     INTEGER NOT NULL UNIQUE,                     -- "Daily #14"
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX dailies_puzzle ON dailies(puzzle_id);
