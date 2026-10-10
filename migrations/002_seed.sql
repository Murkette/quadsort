-- Demo puzzle so there is always something to play. user_id NULL = "by Quadsort".
INSERT INTO puzzles (id, user_id, title, description, groups_json, tags, is_featured) VALUES (
  'demo0001', NULL, 'Group Chat Chaos',
  'Make four groups of four. The group chat managed it. Allegedly.',
  '[{"name":"Cheeses","level":1,"words":["Brie","Feta","Edam","Halloumi"]},
    {"name":"___board","level":2,"words":["Surf","Key","Cup","Skate"]},
    {"name":"Things that squeak","level":3,"words":["Mouse","Trainers","Door","Swing"]},
    {"name":"Hiding an animal","level":4,"words":["Catastrophe","Pigment","Battery","Rational"]}]',
  'demo', 1);
