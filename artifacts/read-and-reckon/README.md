# Read & Reckon

A research log for turning articles into market calls, and market calls into
calibrated judgment.

Each entry links an article and records three things next to it:

- **The issue** — the mechanism you think the article actually describes.
- **The call** — the market, instrument, direction, conviction and horizon
  you would take on the back of it.
- **In hindsight** — how it played out, filled in later.

That third field is the point. Logging a thesis is cheap; scoring it is what
builds the skill. The masthead strip tracks open calls, resolved calls, hit
rate (partial credit for "partly right") and how many distinct markets you
have covered.

## Publishing

`index.html` is the artifact source. It is published to claude.ai as an
Artifact and is written for that runtime: the page body only, with no
`<!doctype>`/`<html>`/`<head>`/`<body>` wrapper, which the publisher supplies.

Runtime capabilities declared at publish time:

| Capability  | Used for                                                  |
|-------------|-----------------------------------------------------------|
| `db`        | Entries persist server-side, across devices and sessions.  |
| `downloads` | CSV export of the log.                                     |
| `sample`    | "Argue the other side" — a counter-case against a thesis.  |

Every capability is resolved through `claude.use(...)` and null-checked. With
none of them available the page still runs, falling back to `localStorage` and
hiding the export and counter-case controls.
