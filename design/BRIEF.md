# Quadsort — original brief

> Written under the working title "Sort Yourself Out". The product is now **Quadsort** at quadsort.com; everything else in this brief still applies.

Design a responsive website called "Sort Yourself Out", a platform where anyone can
create, publish, and share their own word-grouping puzzles (16 words, 4 hidden groups
of 4), then send their audience a link to play.

THE PROBLEM WE SOLVE
Lots of people (content creators, group chats, teachers, fandoms, brands) come up
with funny puzzle ideas but have nowhere to build them and send people to. Sort
Yourself Out is the home for those puzzles: make one in two minutes, get a link,
share it, and see how your audience did.

AUDIENCE
- Creators: people with an audience (TikTok, Instagram, newsletters, Discord) who
  want a puzzle they can link to and that credits them.
- Players: their followers, mostly arriving on mobile from a social link, often with
  no account and no patience for sign-up walls.

SCREENS TO DESIGN (mobile first, then desktop)

1. Landing page
   - Headline that explains the idea in one line, with a playable mini puzzle or
     animated demo in the hero.
   - Two clear actions: "Make a puzzle" and "Play one".
   - A row of featured or trending puzzles.
   - Short "how it works" in three steps: write it, share it, watch people struggle.

2. Puzzle creator
   - Four group cards, each with a category name field and four word fields.
   - Each group is assigned a difficulty level (easiest to most devious), shown by
     colour.
   - Puzzle title, optional description, creator name, and an optional link to the
     creator's social profile.
   - Live preview of the shuffled 4x4 grid beside or below the form.
   - Helpful validation: duplicate words, empty fields, words too long for a tile.
   - Publish step that produces a short share link, a copy button, and share
     buttons.

3. Play screen (the most important screen)
   - Puzzle title and "by [creator]" at the top, with the creator's link.
   - 4x4 grid of word tiles. Tap to select up to four; selected tiles are visibly
     distinct.
   - Controls: Shuffle, Deselect all, Submit.
   - Mistakes remaining indicator (four lives).
   - Feedback states: correct group (tiles merge into a coloured row revealing the
     category name), wrong guess (shake), "one away" toast, already guessed.
   - No account needed to play.

4. Results screen
   - Win and lose versions, with the full solution revealed.
   - Shareable result: a coloured-square grid of the player's guesses plus the
     puzzle link, with a one-tap copy button.
   - How the player compared with everyone else (solve rate, average mistakes).
   - Prominent creator card: follow link and "more puzzles by this creator".
   - A "Make your own" prompt.

5. Creator profile page
   - Name, avatar, bio, social links, and a grid of their puzzles with play counts
     and solve rates.

6. Browse page
   - Search plus filters for trending, new, and topic tags (pop culture, sport,
     food, niche fandoms, and so on).
   - Puzzle cards showing title, creator, play count, and difficulty.

7. Creator dashboard (simple)
   - List of the creator's puzzles with plays, solve rate, most common wrong guess,
     and edit and share actions.

BRAND AND TONE
- The name is a cheeky telling-off, so the voice is dry, playful, and slightly
  bossy: "Sort yourself out.", "Not even close.", "One away. Painful."
- Microcopy should be funny but short, and never get in the way of playing.

VISUAL DIRECTION
- Bold, friendly, and confident, with chunky rounded tiles, strong typography, and
  generous spacing.
- Create an original identity. Do not copy the look, colours, or layout details of
  any existing puzzle game. Choose a distinctive four-colour difficulty palette of
  our own, and make sure the four colours are distinguishable for colour-blind
  players (add a shape or pattern cue as well).
- Tiles must stay readable with long words on a small phone screen.
- Satisfying motion: tile selection, shuffle, the wrong-guess shake, and solved
  groups sliding into place.
- Provide light and dark themes.

DELIVERABLES
- All seven screens at mobile and desktop widths.
- The play screen shown in each state: fresh, tiles selected, one group solved,
  wrong guess, won, lost.
- A small component set: word tile (default, selected, solved, disabled), buttons,
  group row, puzzle card, toast, and input fields.
- A simple wordmark for "Sort Yourself Out".
