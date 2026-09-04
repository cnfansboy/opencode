# Career Mode Ledger

A single-file tracker for an EA SPORTS FC / FIFA Career Mode save: all-time squad
stats, split by season, plus the trophy cabinet.

`index.html` is published as a Claude Artifact, which is where it should be used —
the page there stores data server-side and can read stats out of screenshots. The
file also runs on its own in a browser; without those runtime capabilities it
falls back to `localStorage` and hides the screenshot import.

## Mobile

The page renders as an Artifact, which scales to any screen. Under 900px wide
the sidebar becomes a slide-out drawer (the ☰ button top-left; tap outside it
or navigate to close), and dialogs stack to one column. Wide, genuinely
data-dense tables (Contracts, the All-time players roster) scroll
horizontally inside their own panel. The player profile's season-by-season
table is different: under 600px it drops the grid entirely and becomes a
stack of cards, one per season, each stat as its own label/value row — still
fully editable, just no longer squeezed into fixed columns that don't fit a
phone screen.

## The three views

A sidebar carries the club, three sections and the current squad list — click any name
to open that player.

**Squad & seasons** (the default) shows the current squad only — a player who
has left drops out of the tiles, the leaderboard and the table the moment
they're marked departed, in any scope. See **All-time players** below for the
full history including everyone who's ever left.

- **Players** — name, position (GK / DEF / MID / ATT, colour-coded), shirt number, age
  and nationality. Nationality is typed with autocomplete over ~165 countries (plus
  the four UK nations) and shows as a flag everywhere a player is listed — the
  squad table, the sidebar, the contracts table and their profile. A country
  outside that list is still saved and shown as plain text, just without a flag.
- **Per season** — appearances, goals, assists, clean sheets and average match rating.
  The clean-sheet column appears once anyone has one, and on a keeper's or
  defender's profile always; the squad total shows the best individual tally
  rather than a sum, since a shut-out belongs to the whole back line.
- **All-time** — every season added up; this is what loads first. The
  Appearances, Goals, Assists, Goal contributions and Clean sheets tiles each
  show the record holder's own number and name, not a squad-wide sum. Click
  any of those five and it opens the top 10 for that stat — ranked, with each
  player's per-appearance rate, a bar against the leader, and their name
  linking straight to their profile — scoped to whatever the tiles themselves
  are showing (all-time, or the season picked in the rail).
- **League** — each season picks a league from the top five and the professional
  tier directly below it (Premier League/Championship, LaLiga/LaLiga 2,
  Bundesliga/2. Bundesliga, Serie A/Serie B, Ligue 1/Ligue 2), shown as a flag
  and name on the season chip, on the squad page, and next to that season in a
  player's history. A new season defaults to the same league as the last one —
  change it the season you go up or down. Adding a season is the only way in;
  "Edit season" next to Delete season fixes the league (or the label or club)
  on one already recorded, without touching its stats.
- **Goal contributions** — G+A per player, with a top-five leaderboard and per-appearance rate.
- **Trophies** — competition, type and the season it was won, grouped in the cabinet.

**Wages & finances** — a Capology-style contract table: weekly wage, contract
expiry and years left, the image-rights share the club holds, brand deals per
year and the club's cut of them, and net annual wage cost. Wage, expiry and
image rights are typed straight into the table; brand deals open in a small
editor. Above it: the wage bill, endorsement income, and which contracts are
running down. Years left counts from the end of your newest recorded season, so
a deal ending that year reads "final year", not "expired".

**Leaving the club** — the × on a squad row (or "Remove from squad" on a profile)
takes a player off the squad list, the wage bill, the tiles and the leaderboard
entirely, while keeping everything they did. Record the year and where they
went; they disappear from the dashboard and reappear on **All-time players**
with a "left" status. One click there brings them back. Deleting a player
outright — stats and all — is still available, in the Edit player dialog.

**All-time players** — every player who has ever been part of the club,
current and departed together. Its own tiles and table show the true club
record (so a legend who's since left can still be the all-time top scorer),
each player carries a Current/Left status, and this is where "+ Player" lives
for adding someone new to the roster from scratch.

**Player profile** — one page per player: joined year and previous club, career
totals, a season-by-season table you can type into, the full contract, brand
deals with the club share, and the honours won in seasons they played.
Reachable regardless of squad status — from the current sidebar list, the
All-time players roster, or any leaderboard entry.

## Entering stats

1. **Type them in.** Pick a season in the rail and edit the squad table directly;
   each box saves when you leave it. "Add player" can take a player's numbers at
   the same time.
2. **Import a screenshot.** "Import screenshot" sends screenshots to Claude,
   which reads the rows. Two kinds, picked in the dialog (it defaults to whichever
   suits the page you came from):

   - **Season stats** — apps, goals, assists, clean sheets and rating, filed under
     one season. Choose **Add on top** to add to what the season already holds, or
     **Replace the season** to overwrite it. Competitions the shot shows as won can
     come in as trophies at the same time.
   - **Wages & contracts** — weekly wage, contract expiry year and market value.
     Wages written as "£78K" or "€1.2M" come back as plain numbers, a yearly salary
     is converted to weekly, and a currency it spots can be adopted as the club's.
     Only what the shot actually shows is written; blank fields keep their current
     value.

   Either way every row is shown for checking before anything saves — rename it,
   re-point it at an existing player, fix a number, or drop it.

## Data

Nothing is written to storage until you act — the ledger opens on an example
career, clearly marked, which is cleared by the first thing you add.

Layout: `seasons`, `players`, `stats` (one document per player per season, keyed
`<seasonId>__<playerId>`), `trophies`, and a `meta/career` document holding the
club name.
