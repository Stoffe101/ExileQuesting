# ExileQuesting

ExileQuesting is a modern Path of Exile campaign companion focused on one promise:

> Get from Twilight Strand to maps without wondering where to go, what to collect, or why the route is asking you to do it.

The current campaign foundation provides:

- a complete Acts 1–10 route derived from Exile-UI's proven campaign data;
- semantic player-facing route actions instead of exposing raw upstream markup;
- a glance-first Overlay V2 built around **NOW / DON'T MISS / NEXT**;
- independent Compact, Focus, and Coach overlay presentation modes;
- independent Beginner, Balanced, and Racer guidance depth;
- overlay typography presets plus advanced objective/action/guidance/label/status sizing;
- automatic area tracking through the log file the user explicitly selects;
- strict internal-area events, hybrid filesystem watching + polling fallback, and bounded startup reconciliation;
- XP pacing, passive/trial progress, and confidence-rated layout hints;
- league-start, optional-objective, guidance-depth, and bandit route settings;
- manual correction plus undoable confidence-rated progress history;
- staged upstream updates with structural validation, a data-only compatibility manifest, and a last-known-good fallback;
- live diagnostics, persistent settings/progress, configurable global hotkeys, tray controls, and first-run onboarding;
- a real Windows NSIS installer and a separate portable `.exe` build.

## Safety boundary

ExileQuesting observes and advises. It does not play Path of Exile.

The application may read `Client.txt`/`LatestClient.txt` after making that behavior visible to the user. It does not read process memory, inject code, modify game files, inspect network traffic, click, move the character, craft, use skills/flasks, or trigger game input in response to a timer/log/screen event.

This product is not affiliated with or endorsed by Grinding Gear Games in any way.

## Development

Requirements:

- Node.js 24+
- npm 11+

```bash
npm install
npm run dev
```

Validation:

```bash
npm run typecheck
npm test
npm run audit:campaign
npm run build
```

Windows packages:

```bash
npm run dist
```

`release/` will contain both an NSIS setup executable and a portable executable. The GitHub Actions Windows workflow performs the authoritative Windows packaging test and smoke-tests both the portable and installed application.

## Campaign data updates

The bundled route is pinned to an exact Exile-UI commit. ExileQuesting starts entirely from local verified data so network availability can never block application startup.

After startup, update checks:

1. load a strictly validated, data-only compatibility definition;
2. ask GitHub whether Exile-UI's `main` commit changed;
3. download campaign files for an immutable upstream commit into staging;
4. validate act count, route shape, area data, step count, and references;
5. write accepted data atomically to the app-data folder;
6. keep the previous verified dataset active if any step fails.

The application never activates a new upstream file merely because it exists or parses successfully. Repository CI separately reports relevant upstream file changes, act-by-act route differences, and semantic annotation coverage for review.

## Campaign content quality

The bundled route currently contains 228 pages. `npm run audit:campaign` verifies that every page exposes at least one decisive structured-action signal and reports upstream token/jargon leakage candidates, bespoke guidance coverage, and warning coverage. See [docs/CAMPAIGN_AUDIT.md](docs/CAMPAIGN_AUDIT.md).

## Project direction

The next major milestone is **PoB to Play**: build-stage understanding, gem/vendor planning, passive milestones, link/socket transitions and build-specific campaign actions attached to the same semantic route model.

Later modules include:

- build-specific loot-filter generation;
- gear checkpoints and resistance repair;
- clipboard item parsing and Gear Coach;
- a step-by-step Crafting Coach with item-state validation;
- route splits, run history, and personal-best comparisons.

See [docs/RESEARCH.md](docs/RESEARCH.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/OVERLAY_V2.md](docs/OVERLAY_V2.md), and [docs/ROADMAP.md](docs/ROADMAP.md).

## Attribution and license

ExileQuesting's source is MIT licensed. Campaign data derived from Exile-UI remains subject to its MIT license and attribution. XileHUD was studied as a GPL-3.0 reference; no XileHUD source is incorporated into this MIT codebase. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
