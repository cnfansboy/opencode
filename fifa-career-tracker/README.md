# Career Mode Ledger

A single-file tracker for an EA SPORTS FC / FIFA Career Mode save: all-time squad
stats, split by season, plus the trophy cabinet.

`index.html` is published as a Claude Artifact, which is where it should be used —
the page there stores data server-side and can read stats out of screenshots. The
file also runs on its own in a browser; without those runtime capabilities it
falls back to `localStorage` and hides the screenshot import.

## What it tracks

- **Players** — name and position (GK / DEF / MID / ATT, colour-coded).
- **Per season** — appearances, goals, assists and average match rating.
- **All-time** — every season added up; this is the default view.
- **Goal contributions** — G+A per player, with a top-five leaderboard and per-appearance rate.
- **Trophies** — competition, type and the season it was won, grouped in the cabinet.

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
