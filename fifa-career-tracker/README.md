# Career Mode Ledger

A single-file tracker for an EA SPORTS FC / FIFA Career Mode save: all-time squad
stats, split by season, plus the trophy cabinet.

`index.html` is published as a Claude Artifact, which is where it should be used —
the page there stores data server-side and can read stats out of screenshots. The
file also runs on its own in a browser; without those runtime capabilities it
falls back to `localStorage` and hides the screenshot import.

## The three views

A sidebar carries the club, the two sections and the squad list — click any name
to open that player.

**Squad & seasons** (the default)

- **Players** — name, position (GK / DEF / MID / ATT, colour-coded), shirt number.
- **Per season** — appearances, goals, assists and average match rating.
- **All-time** — every season added up; this is what loads first.
- **Goal contributions** — G+A per player, with a top-five leaderboard and per-appearance rate.
- **Trophies** — competition, type and the season it was won, grouped in the cabinet.

**Wages & finances** — a Capology-style contract table: weekly wage, contract
expiry and years left, the image-rights share the club holds, brand deals per
year and the club's cut of them, and net annual wage cost. Wage, expiry and
image rights are typed straight into the table; brand deals open in a small
editor. Above it: the wage bill, endorsement income, and which contracts are
running down. Years left counts from the end of your newest recorded season, so
a deal ending that year reads "final year", not "expired".

**Player profile** — one page per player: joined year and previous club, career
totals, a season-by-season table you can type into, the full contract, brand
deals with the club share, and the honours won in seasons they played.

## Entering stats

1. **Type them in.** Pick a season in the rail and edit the squad table directly;
   each box saves when you leave it. "Add player" can take a player's numbers at
   the same time.
2. **Import a screenshot.** "Import screenshot" sends squad or player-stats
   screenshots to Claude, which reads the rows. Every row is shown for checking
   before anything saves — you can rename, re-point a row at an existing player,
   fix a number, or drop it. Choose **Add on top** to add the numbers to what the
   season already holds, or **Replace the season** to overwrite it.

## Data

Nothing is written to storage until you act — the ledger opens on an example
career, clearly marked, which is cleared by the first thing you add.

Layout: `seasons`, `players`, `stats` (one document per player per season, keyed
`<seasonId>__<playerId>`), `trophies`, and a `meta/career` document holding the
club name.
