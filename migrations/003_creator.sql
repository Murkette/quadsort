-- Anonymous publishing (until accounts, step 5): credit and edit rights live on the puzzle.
ALTER TABLE puzzles ADD COLUMN creator_name TEXT;
ALTER TABLE puzzles ADD COLUMN creator_url  TEXT;
ALTER TABLE puzzles ADD COLUMN owner_key    TEXT;   -- random per-browser cookie; later claimed by an account
CREATE INDEX puzzles_owner ON puzzles(owner_key);
