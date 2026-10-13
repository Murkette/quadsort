# The Daily — build spec

One puzzle a day that everyone plays. Creators get into the rotation by ticking a box when
they publish. Free for now; the tick box is the exact spot a paywall goes later.

## 1. Rules

- **One puzzle per calendar day**, in US Eastern time (the audience is American; midnight ET is
  the "new puzzle" moment, like the newspaper games people already know).
- **Getting in:** on the publish screen, a checkbox: *"Put this in the Daily rotation."*
  Ticking it stamps the puzzle with the time. That stamp is the queue position.
- **Order:** first in, first out. Oldest opt-in that has not been used goes next.
  One fairness rule: a creator cannot have two Dailies within 7 days. If the next in line
  would break that, skip to the one after.
- **Fallback:** if the queue is empty, use the oldest unused house puzzle (the Quadsort-authored
  ones). The Daily never fails to exist.
- **Hidden or deleted puzzles** drop out of the queue automatically (they already vanish from
  everything else).
- **Frozen words:** once a puzzle is in the queue its words cannot be edited. Title and
  description can. Editing the groups withdraws it from the queue (a puzzle that has already
  been a Daily cannot have its groups edited at all, so the archive stays honest).
- **Picked when first needed:** the first visitor after midnight ET triggers the pick. It is
  written once, inside a transaction, so two simultaneous first visitors get the same puzzle.
- **A puzzle is a Daily once.** After its day it goes back to being an ordinary puzzle, with
  a permanent "Daily on Oct 13" badge.

## 2. Data

```sql
ALTER TABLE puzzles ADD COLUMN daily_opt_in_at INTEGER;   -- NULL = not in rotation
CREATE INDEX puzzles_daily_queue ON puzzles(daily_opt_in_at);

CREATE TABLE dailies (
  day        TEXT PRIMARY KEY,                 -- '2026-10-13' (ET)
  puzzle_id  TEXT NOT NULL REFERENCES puzzles(id),
  number     INTEGER NOT NULL UNIQUE,          -- Daily #1, #2, ... for share text
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

The paywall later: `daily_opt_in_at` gets set only after a successful payment instead of on
the checkbox. Nothing else changes.

## 3. Pages and routes

| Route | What |
|---|---|
| `/daily` | Today's puzzle. Same play screen, with a banner: *"The Daily · #14 · Monday, October 13"* and the creator's credit. Canonical URL is `/daily` so shares land on today's puzzle. |
| `/daily/2026-10-12` | Yesterday's and older, same screen, banner says the date. 404 for the future. |
| `/p/:id` | Unchanged. If that puzzle is today's Daily it shows a small "Today's Daily" tag; if it was one, "Daily #9 · Oct 8". |
| `/` landing | A "Today's Daily" card above Staff Picks: title, creator, play count, one big button. |
| nav | A **Daily** link, first in the list. It is the thing people come back for. |
| publish screen | The opt-in checkbox with one line under it: *"We feature one puzzle a day. Yours goes in line, first come first served. Your words lock once it's in."* |
| dashboard | Per puzzle: *"In line for the Daily, about 6 days away"* / *"Was Daily #9 on Oct 8"*, and a **Withdraw** button while it is still in line. |
| admin | A Queue tab: the line in order with creator and opt-in date, plus **Remove from queue** and **Make tomorrow's Daily** (jumps the line). Hide still works as before. |

## 4. Play and results

- Share text gets a first line like `Quadsort Daily #14` instead of the puzzle title, and the
  link is `quadsort.com/daily` on the day, `/daily/2026-10-13` afterwards.
- Results panel adds **streak**: "3 days in a row". Kept in localStorage on the player's device,
  no account needed. A streak is "played the Daily on consecutive ET days" (win or lose).
- Stats (solve rate, average mistakes, most common wrong guess) work exactly as now; a Daily
  is just a puzzle that got a lot of plays on one day.

## 5. Creator email

When a puzzle becomes the Daily, email its creator: *"Your puzzle is today's Daily."* with the
link. One email, sent at pick time, through the Resend setup that already exists. Skipped
silently if email fails.

## 6. Build order

1. Migration, the picker (`lib/daily.js`: `today()`, `forDay(day)`, `pick(day)`), and tests for
   the rules in section 1 (order, 7-day fairness, fallback, hidden puzzles, same answer twice).
2. `/daily` and `/daily/:day` routes, banner on the play screen, tag on `/p/:id`.
3. Publish checkbox, frozen-words rule in the edit API, dashboard lines, withdraw.
4. Landing card and nav link.
5. Share text, streak.
6. Admin queue tab.
7. Creator email.

Each step ships on its own. Estimated size: about the same as the accounts step.

## 7. Decisions made here (say if you disagree)

- **Eastern time**, not the player's local time. Everyone sees the same puzzle at the same moment.
- **Queue is automatic**, no admin approval. Admins can remove or reorder, but by default a
  published puzzle that opts in will run. With the paywall later this is also the simplest promise
  to sell: pay, you run. Moderation stays reactive (reports, hide).
- **One Daily per creator per 7 days.** Stops one prolific creator owning the week.
- **House puzzles as fallback only.** They never jump a real creator.
- **No account needed to play or keep a streak.** Same rule as the rest of the site.

## 8. Not now

Archive browsing page (a list of past Dailies), leaderboards, time-to-solve, notifications or
push, "Daily for your group chat" private rotations. All later, all cheap to add on top of this.
