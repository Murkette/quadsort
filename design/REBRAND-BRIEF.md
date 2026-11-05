# Quadsort rebrand brief

Redesign the look of Quadsort, a live site where anyone makes a sixteen-word grouping puzzle
(four hidden groups of four), shares a link, and watches friends play it. There is also one
puzzle a day that everyone plays, called the Daily.

The current design is chunky and cartoonish: thick dark outlines, hard drop shadows, bubbly
display type, loud yellow buttons, jokes in every label. Replace it with the look of Apple
around 1999: calm, confident, mostly white, with the six-color rainbow as the one
unmistakable mark of the brand. Vintage, not retro-ironic. Think of a Think Different
poster, a Mac OS 9 window, and the cover of a 1999 Apple catalog, redrawn for a phone screen.

**Do not touch the logo.** The four-tile mark (public/favicon.svg, views/partials/mark.ejs)
stays exactly as it is for now, including its colors. Everything around it changes.

## 1. What the rebrand is

**One memorable thing: the rainbow.** The classic six stripes, in this order, top to bottom:

| Stripe | Hex |
|---|---|
| Green | `#61BB46` |
| Yellow | `#FDB827` |
| Orange | `#F5821F` |
| Red | `#E03A3E` |
| Purple | `#963D97` |
| Blue | `#009DDC` |

Use the stripe as a single horizontal band, 4 to 6 px tall, in exactly three places: the top
edge of every page (above the header), the share image, and the Daily banner. Nowhere else.
It should feel like a signature, not a pattern. No gradients, no diagonal stripes, no rainbow
text, no rainbow borders on cards.

**Everything else is quiet.** White paper, platinum gray chrome, black type, one blue for
links. The rainbow only works because the rest is disciplined.

**The four puzzle colors come from the stripe.** Difficulty levels, Gentle to Devious:
Green `#61BB46`, Yellow `#FDB827`, Orange `#F5821F`, Purple `#963D97`. Red is reserved for
errors and destructive actions; blue for links. The colorblind-safe shape per level
(circle, triangle, square, diamond) stays and is still required.

## 2. Tokens

Replace the variables at the top of `public/css/site.css`. Keep the variable names so the
rest of the stylesheet keeps working; change the values and add the few new ones.

**Light (default)**

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FFFFFF` | page |
| `--surf` | `#F2F2F2` | platinum panels, header, footer |
| `--surf2` | `#E6E6E6` | pressed and inset areas |
| `--ink` | `#1A1A1A` | text |
| `--mute` | `#5C5C5C` | secondary text (4.5:1 on all three surfaces) |
| `--line` | `#8A8A8A` | 1 px rules and control outlines (3:1 on white) |
| `--link` | `#0A5FB4` | links only |
| `--err` | `#C8201F` | errors, delete |
| `--focus` | `#0A5FB4` | keyboard focus ring |
| `--d1` to `--d4` | the four stripe colors above | difficulty |
| `--shadow` | none | hard drop shadows are gone |

**Dark ("Graphite")**: `--bg #262626`, `--surf #2F2F2F`, `--surf2 #3A3A3A`, `--ink #F0F0F0`,
`--mute #B5B5B5`, `--line #8F8F8F`, `--link #7FB6EE`, `--err #FF7B7A`, `--focus #7FB6EE`.
The stripe colors do not change in dark mode. Dark text (`#1A1A1A`) stays on green, yellow
and orange; white text stays on purple.

Existing tests read the stylesheet and fail if text drops under 4.5:1 or borders and focus
under 3:1 in either theme. Keep them passing; they are the quality floor, not a suggestion.

## 3. Typography

Apple Garamond is not available, so use the closest free pair and set it the way Apple did:
large, tight, lots of white space around it.

- **Display and headlines: EB Garamond**, weight 500, letter-spacing −0.015em, line-height
  1.05. Headlines are big and lowercase-friendly ("Four groups of four."), never all caps,
  never one word colored.
- **Interface, body and tiles: Archivo** (variable). Body at 17px/1.5, regular. Tiles in
  Archivo SemiBold, uppercase, with the width axis narrowing for long words (the current
  Bricolage behavior maps onto Archivo's `wdth` axis directly; keep the fit-to-tile script).
- No tracked-out small caps labels, no eyebrows above headings, no monospace. If a label is
  needed, it is sentence case in `--mute`.
- Self-host both fonts as the current two are (`public/fonts`), latin subset only.

## 4. Surfaces and controls

Model everything on Mac OS 9's Platinum appearance, simplified:

- **Panels** are white on white, separated by 1 px `--line` rules or by resting on a `--surf`
  platinum band. Corner radius 6 px. No drop shadows anywhere.
- **Buttons** are 1 px outlined pills with a 1 px inner highlight on top (`inset 0 1px 0
  #FFFFFF`) and a 1 px darker edge at the bottom; pressed state inverts the bevel and shifts
  the label down 1 px. The primary button is `--ink` filled with white text. There is one
  primary button per screen.
- **Tiles** are white, 1 px `--line` outline, 6 px radius, no shadow. Selected: `--ink`
  fill, white text, no translate. Solved groups become a flat colored row in the level
  color with the shape and the category name; revealed-after-loss rows are the same with a
  dashed outline. The "pressed in 2 px" spring is gone.
- **Inputs** are white with a 1 px `--line` outline and a 1 px inset top shadow, the classic
  Platinum text field. Focus is the 2 px `--focus` ring, outside.
- **The header** is a 44 px platinum bar under the rainbow band: mark on the left, wordmark in
  EB Garamond, text links on the right. No yellow pill.
- **The footer** is a platinum band with small text links and the theme switch.

## 5. Motion

Keep what tells the player something; remove what performs.

- Selecting a tile: instant.
- Wrong guess: the existing shake, but 240 ms and ±6 px.
- Correct guess: the four tiles slide into the colored row over 280 ms ease-out, no overshoot,
  then the category name appears (no typewriter).
- Toasts fade in 120 ms, hold, fade out.
- No hover lifts on cards, no page-load entrances. `prefers-reduced-motion` already swaps
  movement for fades; keep that.

## 6. Voice

"A little less quirky" applies to words too. Keep the dry confidence, drop the telling-off.
Short declarative sentences in sentence case, like 1999 Apple copy.

| Now | Rebrand |
|---|---|
| Sort yourself out. (lose) | Out of guesses. |
| Sorted. Annoyingly well. | Solved. |
| Not even close. | Not quite. |
| One away. Painful. | One away. |
| You tried that. Focus. | Already tried. |
| Watch your mates crumble. | See how your friends do. |
| Nothing. Not a sausage. | No puzzles match. |
| Reckon you could do meaner? | Make your own. |
| Make four groups of four. The group chat managed it. Allegedly. | Four groups of four. |

The name "Quadsort" and the tagline on the landing page become: **"Four groups of four."**
followed by one plain sentence: "Make a word puzzle, share one link, see how everyone did."
American English throughout (the site's audience is American).

## 7. Screens

Redo every screen at 375 px and 1200 px, light and Graphite. Flows, routes and markup
structure stay as they are; this is a reskin plus copy pass, not a rebuild.

1. Landing: rainbow band, header, headline, the Daily card, the two-group warm-up, staff
   picks, trending, how it works, creators band (now a platinum band, not a dark box), footer.
2. Play: fresh, tiles selected, one group solved, wrong guess, won, lost, plus the Daily banner
   version and the report dialog.
3. Results: win and lose, share card, answers, stats, creator card, streak.
4. Creator: empty, with errors, ready to publish, published, and the edit view with locked
   words.
5. Creator profile and browse.
6. Dashboard and admin (reports, Daily line, all puzzles).
7. Login, signup, forgot, reset, settings, 404.

Plus the share image (`public/og.png`, 1200×630): white, the rainbow band, the headline, a
solved 4×4 board in the new tile style. The favicon and touch icon are unchanged.

## 8. Constraints that do not move

- Tiles must hold a 14-character word on a 320 px screen. The fit script stays.
- Every state above is already covered by tests: contrast in both themes, one h1 per page,
  skip link, focus visible, labels on repeated buttons. The rebrand ships green.
- No new dependencies and no build step. Fonts are two woff2 files, styles are one CSS file.
- Nothing about play, scoring, the Daily, accounts or moderation changes.

## 9. Deliver

1. The token block and type setup in `site.css`, with the two new fonts.
2. Components: tile (default, selected, solved, revealed, long word), buttons (primary,
   secondary, destructive, disabled), inputs, group row, puzzle card, toast, dialog, the
   rainbow band, the header and footer.
3. All screens in section 7, each checked on a phone-width viewport and in Graphite.
4. The new share image.
5. The copy table in section 6 applied across templates and scripts.

## 10. As built

Shipped as written, with these deliberate differences:

- **`--line` is `#7F7F7F`, not `#8A8A8A`.** Control outlines must reach 3:1 on the darkest platinum surface
  (`#E6E6E6`), and `#8A8A8A` only reaches 2.8:1 there. The contrast tests enforce it.
- **The header's "Make a puzzle" is a secondary button.** The brief says one primary per screen, and every
  page has its own primary action. The landing page's primary is the hero's "Make a puzzle".
- **The rainbow is six 1px stripes stacked into a 6px band** (the classic stack, as a rule), in four places
  rather than three: the top of every page, the Daily banner, the landing page's Daily card (same moment as
  the banner), and the share image.
- **The logo keeps its old four colors.** `views/partials/mark.ejs` now pins them as hex values, so changing
  the page palette cannot touch it. This does mean the mark's yellow-blue-orange-violet no longer matches the
  green-yellow-orange-purple puzzle colors beside it; fixing that is a logo decision, left for later.
- **Motion:** tile selection is instant; the solve slide is 280 ms ease-out with no overshoot; the shake is
  240 ms at 6 px; the typewriter, life pop, tile flip and entrance slides are gone.
- **Asset URLs are fingerprinted** (`/css/site.css?v=3f9a1c2e`) so a rebrand never reaches visitors with
  week-old cached styles. Not in the brief; needed for any visual change to ship cleanly.
- **Voice** beyond the brief's table: every other telling-off line was rewritten the same way, and a test
  (`test/brand.test.js`) fails if a banned phrase or a British spelling reaches any page.
