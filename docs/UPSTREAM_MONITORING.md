# Upstream monitoring and league-update flow

ExileQuesting depends on several upstream data contracts, but they are deliberately isolated so one provider changing cannot corrupt the others.

## Upstream families

### Exile-UI campaign data

`.github/workflows/upstream-monitor.yml` runs every six hours.

It compares the bundled Exile-UI commit with upstream `main`, identifies campaign-relevant changed files, validates guide/area structure, produces an Act-by-Act semantic diff and checks whether ExileQuesting's semantic annotations still match.

The installed app separately stages and validates compatible campaign data before activation. A rejected update leaves the verified bundled/last-known-good route active.

### Maxroll leveling planners

`.github/workflows/companion-upstream-monitor.yml` runs every twelve hours and probes two representative live contracts:

- a normal leveling planner;
- a Twink leveling planner.

The contracts require the public guide state, planner discovery and meaningful structured progression to remain parseable. The probes intentionally cover the two distinct planner families instead of assuming Twink and normal guides share one schema.

The September 2026 full-corpus audit remains documented in `LEVELING_GUIDE_AUDIT.md`; scheduled checks use representative contracts to avoid hammering an external provider.

### Mobalytics

Mobalytics currently returns HTTP 403 to non-browser application probes, so direct URL fetch is not a production dependency.

The monitor treats 403 as the expected informational state. If the public build suddenly becomes HTTP 200, it immediately attempts ExileQuesting's bounded `__PRELOADED_STATE__` parser. A successful parse opens a review issue because safe direct URL import may have become viable.

Until then, Mobalytics builds enter ExileQuesting through their Path of Building / POBb.in export.

### Gem acquisition and passive tree

The same twelve-hour companion monitor reads `assets/game-data/manifest.json`, so the source repository/revision/path is defined in one provenance record rather than duplicated in monitoring configuration.

For each git-backed dataset it:

1. reads the exact pinned revision;
2. checks the source repository's current HEAD;
3. compares pinned -> current when HEAD moved;
4. asks for review only when one of the exact pinned source paths changed.

Unrelated commits in a source repository are reported as information, not as a false-positive compatibility failure.

## Review issues are advisory

Both monitors are fail-conservative.

A compatibility issue means **review this upstream change**. It does not:

- update an adapter;
- replace bundled files;
- advance a source commit;
- download executable code;
- modify a player's saved build/campaign state;
- make normal release CI depend on an external website being online.

Permanent release CI remains deterministic and fixture/bundle based.

## Suggested PoE 3.30 update procedure

When a new league changes game data:

1. Let the monitor identify whether the pinned gem/passive source paths changed.
2. Review GGG passive-tree changes and the gem acquisition source changes.
3. Advance the version/source pins in the generators only after the new data is identified.
4. Generate the new passive snapshot and gem-acquisition snapshot.
5. Regenerate the shared provenance manifest.
6. Validate passive geometry/IDs, gems/offers and manifest SHA-256/size/source metadata.
7. Re-run Maxroll compatibility against the new bundled passive/gem snapshots.
8. Review Exile-UI's route diff and semantic annotation matches.
9. Re-run campaign audit/lint/simulation and the full Linux + Windows release gate.
10. Ship the new installer only after the real previous-version -> candidate updater handoff succeeds.

The current generator filenames/source pins still include the league version explicitly. That is intentional provenance, not an auto-follow-HEAD mechanism. A future refactor can centralize the league identifier, but changing league data should remain a reviewed action rather than an invisible background mutation.

## Current verified state

At the time of the September 2026 hardening pass:

- the representative normal Maxroll contract parses with six skill milestones and 93 passive operations;
- the representative Twink contract parses with seven skill milestones, 90 passive operations and three equipment milestones;
- Mobalytics remains HTTP 403 to application probes and therefore stays on the PoB bridge;
- the pinned gem-acquisition source revision equals its repository HEAD;
- the pinned GGG passive-tree source revision equals its repository HEAD.

These numbers are monitor baselines, not permanent game-design assumptions. If they change meaningfully, the monitor requests review rather than silently declaring the new shape compatible.
