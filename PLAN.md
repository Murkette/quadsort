# Quadsort — build plan

A Connections-style word-grouping game where anyone can make a puzzle, get a link,
and see how their audience did. Mobile-first, no sign-up to play, one small
DigitalOcean droplet.

Design source of truth: `design/BRIEF.md` and the 19 boards in `design/mockups/`
(palette, fonts, motion spec, every screen at mobile + desktop).

## 1. Stack (chosen for one $6 droplet, one person maintaining it)

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 20+ (22 on the droplet), single process | One thing to run, one thing to restart |
| Server | Express 5 | Routing + static files + sessions; nothing more needed |
| DB | SQLite via `better-sqlite3` | Zero ops, fits in RAM, one file to back up. Handles thousands of plays/day easily |
| Templates | Server-rendered HTML with `ejs` | Shareable links need real HTML for OG previews; no SPA, no bundler |
| Front-end | Vanilla JS + CSS, one `app.js` per page | The game logic is ~300 lines; a framework would be heavier than the app |
| Auth | Email + password hashed with Node's built-in `scrypt`, cookie sessions in SQLite (only a hash of the token is stored) | No dependency, no email provider needed on day one |
| Fonts | Bricolage Grotesque + Figtree, self-hosted woff2 | Matches mockups; no Google round-trip on a phone |
| Proxy / TLS | Caddy | Auto HTTPS with a two-line config |
| Process | systemd | Restart on crash, start on boot |

Skipped: React/Next, Postgres, Redis, Docker, Tailwind, a build step. Add when a
measured problem appears, not before.

## 2. Repo layout

```
quadsort/
  server.js            # Express app, routes, session middleware
  db.js                # opens SQLite, runs migrations/*.sql in order
  migrations/001.sql
  lib/
    puzzle.js          # validate, shuffle, short id, "one away" check
    stats.js           # solve rate, avg mistakes, trending query
  routes/
    pages.js           # GET / /browse /p/:id /u/:name /create /dashboard
    api.js             # POST /api/puzzles /api/plays, auth endpoints
  views/               # ejs: layout, landing, play, results, create, profile, browse, dashboard
  public/
    css/site.css       # tokens from design/mockups/Main.dc.html (light + dark)
    js/play.js         # game state machine + animations
    js/create.js       # creator form, live preview, validation, publish
    fonts/
  design/              # brief + mockups (reference only, not served)
  deploy/
    Caddyfile
    quadsort.service
    deploy.sh
    backup.sh
  PLAN.md
```

## 3. Data model

```sql
users      id, username (unique, url-safe), email (unique), password_hash,
           display_name, bio, avatar_url, social_url, is_admin, created_at

puzzles    id (8-char base62, used in URL), user_id, title, description,
           groups_json,          -- [{name, level 1-4, words[4]}] x4
           tags (comma list), is_published, is_featured, is_flagged,
           created_at, updated_at

plays      id, puzzle_id, player_key (random uuid in localStorage),
           won, mistakes, guesses_json,   -- [[word x4, result]] for the share grid
           created_at

sessions   id, user_id, expires_at
```

Derived, never stored: play count, solve rate, avg mistakes, most common wrong
guess, trending score. All are single `GROUP BY puzzle_id` queries; add a
`puzzle_stats` cache table only if a query shows up slow in logs.

Indexes: `plays(puzzle_id, created_at)`, `puzzles(user_id)`, `puzzles(is_featured)`.

## 4. Pages and what each does

| Route | Page | Needs login |
|---|---|---|
| `/` | Landing: hero mini-puzzle, Make / Play CTAs, featured row, how it works | no |
| `/p/:id` | Play. Renders grid server-side with shuffled words; solution never sent until solved or lost (checked via `POST /api/plays/check`) | no |
| `/p/:id` (end state) | Results panel swaps in on the same page: solution, share grid, stats vs everyone, creator card, "make your own" | no |
| `/create` | Creator form, live preview, validation, publish → share link | yes (prompt appears at publish, not before) |
| `/p/:id/edit` | Same form, prefilled | owner |
| `/u/:username` | Creator profile + puzzle grid with plays/solve rate | no |
| `/browse` | Search, tabs: trending / new / tag | no |
| `/dashboard` | Owner's puzzles: plays, solve rate, top wrong guess, edit, share | yes |
| `/login` `/signup` `/logout` | Plain forms | – |
| `/admin` | Toggle featured / flagged. Just a table with two buttons | admin |

### Play flow (the important one)
1. Server renders 16 shuffled tiles and a `puzzleId`. Groups and category names are **not** in the HTML.
2. Player selects 4, hits Submit → `POST /api/plays/check {puzzleId, words[4]}`.
3. Server responds `{result: "correct", group:{name, level, words}} | {result:"one_away"} | {result:"wrong"}`.
4. Four mistakes or four groups → client `POST /api/plays {won, mistakes, guesses}`; server returns full solution + aggregate stats for the results panel.
5. Already-guessed combos are blocked client-side ("You tried that. Focus.").

Checking server-side keeps the answers out of view-source without needing anything
clever. One extra request per guess is fine.

### Trending
`plays in last 7 days` ordered desc, computed in the browse query. Featured =
`is_featured` flag you set in `/admin`.

### Share text
```
Quadsort — "Puzzle title"
🟡🟡🟡🟡
🔵🔵🟠🔵
...
https://quadsort.com/p/abc123
```
Emoji mapped from the 4 levels; built client-side from `guesses`.

### OG preview
Each `/p/:id` sets `og:title`, `og:description` ("by @creator · 1.2k plays"), and a
static `og:image`. Per-puzzle generated images: later, if share CTR matters.

## 5. Build order (each step leaves a working site)

1. **Scaffold** — `npm init`, Express, SQLite, migrations, layout.ejs, `site.css` tokens from the mockups, fonts. `GET /` says hello. Deploy this to the droplet first so the pipeline is proven before there's anything to break.
2. **Play** — hardcode one seed puzzle, build `play.js` state machine + `/api/plays/check`, all six states and the motion spec. This is the product; polish here.
3. **Results + plays logging** — `/api/plays`, share grid, stats.
4. **Create + publish** — form, validation, preview, short id, share step. Puzzles can be made anonymously-but-owned by session until login exists.
5. **Accounts** — signup/login, attach puzzles to users, dashboard, profile.
6. **Browse + landing** — trending/new/tags, featured row, hero mini-puzzle (reuses `play.js` with a 2×2 or 4×4 demo).
7. **Admin + moderation** — featured toggle, report button → `is_flagged`.
8. **Dark theme, reduced-motion, a11y pass** — tokens already exist; wire `prefers-color-scheme` + a toggle.

Each step: one commit, `deploy.sh`, check on a phone.

## 6. Droplet setup (Ubuntu 24.04, 1 vCPU / 1 GB, $6/mo)

```bash
# once
apt install -y caddy sqlite3 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
adduser --system --group quadsort
git clone https://github.com/Murkette/quadsort.git /opt/quadsort && chown -R quadsort:quadsort /opt/quadsort
mkdir -p /var/lib/quadsort && chown quadsort:quadsort /var/lib/quadsort      # holds quadsort.db
cp /opt/quadsort/deploy/quadsort.service /etc/systemd/system/ && systemctl enable --now quadsort
cp /opt/quadsort/deploy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy
```

`Caddyfile`:
```
quadsort.com {
  reverse_proxy localhost:3000
  encode gzip
}
```

`quadsort.service`: runs `node server.js` as `quadsort`, `Environment=DB_PATH=/var/lib/quadsort/quadsort.db`, `Restart=always`.

`deploy.sh` (run on the droplet): `git pull && npm ci --omit=dev && systemctl restart quadsort`.

`backup.sh` (daily cron): `sqlite3 /var/lib/quadsort/quadsort.db ".backup /var/backups/quadsort/$(date +%F).db"`, keep 14. Push to DO Spaces later if the site matters.

Add 1 GB swap so `npm ci` never OOMs on 1 GB RAM.

## 7. Open decisions (defaults chosen, change if you disagree)

- **Name + domain**: Quadsort at `quadsort.com` (confirmed). The mockups still carry the old "Sort Yourself Out" wordmark; redo the wordmark in step 1, keep the dry voice lines ("Not even close.", "One away. Painful.") as microcopy.
- **Accounts required to publish**: yes (built). The login prompt appears only at the publish step; the half-finished puzzle is kept as a local draft and is waiting after signup. Credit name and social link come from the account profile (`/settings`), not per-puzzle fields.
- **Email verification / password reset**: skipped at launch. Add Resend or Postmark when the first "I forgot my password" arrives.
- **Rate limiting**: `express-rate-limit` on `/api/*` and auth routes from day one. Cheap, prevents a bored follower hammering the plays table.
- **Profanity / abuse**: report button + admin flag only. No automated filter.

## 8. Not doing (yet)

Comments, likes, leaderboards, puzzle series, image tiles, timed mode, i18n,
mobile apps, analytics beyond our own `plays` table. Every one of these is a
later feature with no cost to deferring.
