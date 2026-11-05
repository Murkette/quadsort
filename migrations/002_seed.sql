-- Demo puzzle so there is always something to play. user_id NULL = "by Quadsort".
-- (Reworded after launch for American English; databases that already ran this are refreshed by scripts/seed-puzzles.js.)
INSERT INTO puzzles (id, user_id, title, description, groups_json, tags, is_featured) VALUES (
  'demo0001', NULL, 'Group Chat Chaos',
  'Four groups of four.',
  '[{"name":"Cheeses","level":1,"words":["Brie","Feta","Edam","Gouda"]},
    {"name":"___board","level":2,"words":["Surf","Key","Cup","Skate"]},
    {"name":"Things that squeak","level":3,"words":["Mouse","Sneakers","Door","Swing"]},
    {"name":"Hiding an animal","level":4,"words":["Catastrophe","Pigment","Battery","Rational"]}]',
  'demo', 1);
