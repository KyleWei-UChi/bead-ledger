# Changelog

All notable changes to Bead Ledger are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

Because this app owns your inventory data, one rule matters more than the rest:
**a change that alters the shape of `data/beads.json` is a major version**, and
this file will say exactly what to do about it. The file currently carries
`version: 1`.

## [1.0.0] — 2026-11-21

First release. Everything below is the starting point rather than a change.

### Stock and history

- Append-only ledger of `opening` / `restock` / `consume` / `adjust` entries;
  stock is always derived from it, never stored, so every number traces back to
  a dated event.
- All 221 MARD codes (A26 B32 C29 D26 E24 F25 G21 H23 M15) with per-colour name
  and hex overrides stored in your own data file.
- JSON export and import, and a **Start fresh** reset.

### Planning

- Blueprints with a parsed legend, reserving beads for what you plan to build.
- Finishing a blueprint logs what you actually used, including colour
  **substitutions** when you deviated from the chart. Re-finishing replaces the
  earlier consumption instead of double-counting it; reopening refunds it.
- Orders record deliveries, which are the only thing that adds stock.

### Reorder forecasting

- Per-colour reorder points from a safety-stock formula over your own history,
  so fast-moving and lumpy colours are both flagged earlier than steady ones.
- `short` / `order` / `watch` / `ok` statuses, and suggested order quantities
  rounded to whole packs.
- Configurable lead time, safety buffer, service level, history window, target
  cover and pack size.

### Charts

- Monthly consumption, heaviest colours, and a runway plot of consumption rate
  against days of cover, with the protection period drawn as a band.

### Running it

- Zero-dependency local data server with atomic writes and 20 rolling backups.
- `npm run app` builds a double-clickable macOS launcher.
- `npm run build:artifact` builds the same app against a Claude Artifact
  database for a hosted copy. The two stores never sync.
- `npm run seed` writes a fabricated year of history for trying the app out.
