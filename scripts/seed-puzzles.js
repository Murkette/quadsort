#!/usr/bin/env node
// House puzzles, credited to Quadsort. Safe to re-run: existing ids are left alone.
//   node scripts/seed-puzzles.js            (uses DB_PATH like the server)
// Groups go Gentle (1) -> Devious (4). Every puzzle is checked with the same validator the site uses.
const { validate } = require('../public/js/validate');

const PUZZLES = [
  { id: 'demo0001', title: 'Group Chat Chaos', description: 'Make four groups of four. The group chat managed it. Allegedly.', tags: ['wordplay'], featured: 1, groups: [
    { level: 1, name: 'Cheeses', words: ['Brie', 'Feta', 'Edam', 'Gouda'] },
    { level: 2, name: '___board', words: ['Surf', 'Key', 'Cup', 'Skate'] },
    { level: 3, name: 'Things that squeak', words: ['Mouse', 'Sneakers', 'Door', 'Swing'] },
    { level: 4, name: 'Hiding an animal', words: ['Catastrophe', 'Pigment', 'Battery', 'Rational'] },
  ] },
  { id: 'ballpark', title: 'Ballpark Figures', description: 'Peanuts, Cracker Jack, and four groups you will get wrong.', tags: ['sport'], featured: 1, groups: [
    { level: 1, name: 'Parts of a ballpark', words: ['Dugout', 'Bullpen', 'Bleachers', 'Mound'] },
    { level: 2, name: 'Slang for a home run', words: ['Dinger', 'Homer', 'Jack', 'Tater'] },
    { level: 3, name: 'Pitches', words: ['Curve', 'Slider', 'Sinker', 'Cutter'] },
    { level: 4, name: '___ball', words: ['Pin', 'Odd', 'Screw', 'Hair'] },
  ] },
  { id: 'states01', title: 'States of Mind', description: 'Fifty states. Sixteen words. Four groups. Zero mercy.', tags: ['history'], featured: 0, groups: [
    { level: 1, name: 'New ___', words: ['York', 'Orleans', 'Haven', 'Jersey'] },
    { level: 2, name: '___ Island', words: ['Rhode', 'Long', 'Coney', 'Staten'] },
    { level: 3, name: 'State capitals that are first names', words: ['Austin', 'Jackson', 'Helena', 'Madison'] },
    { level: 4, name: 'The ___ State (nicknames)', words: ['Keystone', 'Buckeye', 'Hoosier', 'Badger'] },
  ] },
  { id: 'gravy001', title: 'Pass the Gravy', description: 'Thanksgiving, sorted. Unlike your family.', tags: ['food'], featured: 0, groups: [
    { level: 1, name: 'Pies', words: ['Pumpkin', 'Pecan', 'Apple', 'Cherry'] },
    { level: 2, name: 'Turkey parts', words: ['Breast', 'Wing', 'Thigh', 'Drumstick'] },
    { level: 3, name: 'Macy’s parade balloons', words: ['Snoopy', 'Pikachu', 'Garfield', 'Spongebob'] },
    { level: 4, name: '___ Bowl', words: ['Super', 'Rose', 'Sugar', 'Punch'] },
  ] },
  { id: 'credits1', title: 'Roll Credits', description: 'Movie trivia with a twist. Two twists, actually.', tags: ['tv-film'], featured: 0, groups: [
    { level: 1, name: 'Famous Toms', words: ['Hanks', 'Cruise', 'Selleck', 'Arnold'] },
    { level: 2, name: 'Pixar movies', words: ['Up', 'Cars', 'Coco', 'Soul'] },
    { level: 3, name: '___-Man superheroes', words: ['Iron', 'Spider', 'Ant', 'Aqua'] },
    { level: 4, name: '___ Story (movies)', words: ['Toy', 'Love', 'Ghost', 'Christmas'] },
  ] },
  { id: 'spellchk', title: 'Say It, Don’t Spray It', description: 'Read these out loud. Then feel silly.', tags: ['wordplay'], featured: 1, groups: [
    { level: 1, name: 'Sound like letters', words: ['Bee', 'Sea', 'Jay', 'Tee'] },
    { level: 2, name: 'Sound like numbers', words: ['Won', 'Too', 'Ate', 'Fore'] },
    { level: 3, name: 'Add an S to the front', words: ['Cream', 'Hare', 'Tool', 'Pine'] },
    { level: 4, name: 'Hiding a body part', words: ['Legend', 'Armada', 'Earnest', 'Shindig'] },
  ] },
  { id: 'gamenite', title: 'Game Night', description: 'Somebody is going to flip the board.', tags: ['gaming'], featured: 0, groups: [
    { level: 1, name: 'Monopoly tokens', words: ['Thimble', 'Boot', 'Wheelbarrow', 'Scottie'] },
    { level: 2, name: 'Mario Kart items', words: ['Banana', 'Shell', 'Star', 'Mushroom'] },
    { level: 3, name: 'Poker hands', words: ['Flush', 'Straight', 'Pair', 'Full House'] },
    { level: 4, name: '___jack', words: ['Black', 'Flap', 'Lumber', 'Apple'] },
  ] },
  { id: 'bills001', title: 'Bills, Bills, Bills', description: 'Show me the money. Then sort it.', tags: ['history', 'wordplay'], featured: 1, groups: [
    { level: 1, name: 'Faces on US bills', words: ['Lincoln', 'Hamilton', 'Grant', 'Franklin'] },
    { level: 2, name: 'Slang for money', words: ['Dough', 'Cheddar', 'Clams', 'Bones'] },
    { level: 3, name: '___ dollar', words: ['Sand', 'Silver', 'Top', 'Half'] },
    { level: 4, name: 'Famous Bills', words: ['Gates', 'Murray', 'Clinton', 'Nye'] },
  ] },
  { id: 'senioryr', title: 'Senior Year', description: 'Sixteen words. One of them is still in detention.', tags: ['pop-culture', 'tv-film'], featured: 0, groups: [
    { level: 1, name: 'High school cliques', words: ['Jocks', 'Nerds', 'Goths', 'Preps'] },
    { level: 2, name: 'Prom night', words: ['Corsage', 'Limo', 'Tux', 'Slow Dance'] },
    { level: 3, name: '___ hall', words: ['Study', 'Mess', 'Town', 'Pool'] },
    { level: 4, name: 'John Hughes movies, minus a word', words: ['Breakfast', 'Sixteen', 'Pretty', 'Ferris'] },
  ] },
  { id: 'cloudy01', title: 'Partly Cloudy', description: 'A 100% chance of second-guessing.', tags: ['science', 'sport'], featured: 0, groups: [
    { level: 1, name: 'Clouds', words: ['Cumulus', 'Cirrus', 'Stratus', 'Nimbus'] },
    { level: 2, name: 'Storm words', words: ['Eye', 'Surge', 'Gust', 'Squall'] },
    { level: 3, name: '___front', words: ['Cold', 'Water', 'Fore', 'Store'] },
    { level: 4, name: 'Pro sports teams', words: ['Heat', 'Thunder', 'Lightning', 'Avalanche'] },
  ] },
  { id: 'drivethr', title: 'Drive-Thru', description: 'Would you like regret with that?', tags: ['food'], featured: 1, groups: [
    { level: 1, name: 'Burger toppings', words: ['Lettuce', 'Pickle', 'Onion', 'Tomato'] },
    { level: 2, name: 'Fast food mascots', words: ['Ronald', 'Wendy', 'Colonel', 'King'] },
    { level: 3, name: '___ fries', words: ['Curly', 'Waffle', 'Shoestring', 'Crinkle'] },
    { level: 4, name: 'Second word of a chain', words: ['Bell', 'Queen', 'Express', 'Guys'] },
  ] },
];

function check() {
  const problems = [];
  for (const p of PUZZLES) {
    const v = validate(p);
    if (!v.ok) problems.push(`${p.id}: ${v.errors.map((e) => e.msg).join(' | ')}`);
    if (!/^[0-9a-zA-Z]{8}$/.test(p.id)) problems.push(`${p.id}: bad id`);
  }
  return problems;
}

module.exports = { PUZZLES, check };

if (require.main === module) {
  const problems = check();
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  const db = require('../db')();
  const insert = db.prepare(`INSERT OR IGNORE INTO puzzles (id, user_id, title, description, groups_json, tags, is_featured)
    VALUES (?, NULL, ?, ?, ?, ?, ?)`);
  const fixDemo = db.prepare("UPDATE puzzles SET groups_json = ?, tags = ?, is_featured = ? WHERE id = 'demo0001'");
  let added = 0;
  db.transaction(() => {
    for (const p of PUZZLES) {
      const v = validate(p).value;
      const groups = JSON.stringify(v.groups);
      if (p.id === 'demo0001') { fixDemo.run(groups, p.tags.join(','), p.featured); continue; }
      added += insert.run(p.id, v.title, v.description, groups, p.tags.join(','), p.featured).changes;
    }
  })();
  console.log(`${added} puzzles added, demo puzzle refreshed, ${PUZZLES.length} total house puzzles`);
}
