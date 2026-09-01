# ExileQuesting

ExileQuesting is a modern Path of Exile campaign companion focused on one promise:

> Get from Twilight Strand to maps without wondering where to go, what to collect, or why the route is asking you to do it.

Current development milestone: **v0.1.3 responsive manager + update channel**.

The current campaign foundation provides:

- a complete Acts 1–10 route derived from Exile-UI's proven campaign data;
- semantic player-facing route actions instead of exposing raw upstream markup;
- a glance-first Overlay V2 built around **NOW / DON'T MISS / NEXT**;
- independent Compact, Focus, and Coach overlay presentation modes;
- independent Beginner, Balanced, and Racer guidance depth;
- overlay typography presets plus advanced objective/action/guidance/label/status sizing;
- automatic area tracking through the log file the user explicitly selects;
- strict internal-area events, hybrid filesystem watching + polling fallback, and bounded startup reconciliation;
- XP pacing and confidence-rated layout hints;
- explicit permanent-reward auditing that distinguishes route-passed from actually confirmed passive/trial rewards;
- a persistent campaign run timer with Act splits, town time, previous-run and personal-best history;
- a live detection trace showing how Client.txt events become route decisions;
- abnormal-shutdown recovery and renderer/process diagnostics;
- league-start, optional-objective, guidance-depth, and bandit route settings;
- manual correction plus undoable confidence-rated progress history;
- staged upstream updates with structural validation, a data-only compatibility manifest, and a last-known-good fallback;
- installed-application update checking, verified installer download, and restart-to-install flow;
- live diagnostics, persistent settings/progress, configurable global hotkeys, tray controls, and first-run onboarding;
- a deterministic Acts 1–10 campaign simulator, captured-log replay and replay-bundle export;
- a Pre-playtest Lab for browsing any route page in the real overlay without mutating saved progress;
- Windows manager responsive regression for 1080p, compact/scaled viewports, and ultrawide displays;
- Windows overlay visual regression at multiple DPI scale factors plus a real Electron window lifecycle soak;
- a Windows NSIS installer validated through clean install, installed-app startup and uninstall in GitHub Actions.

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

Complete deterministic pre-playtest verification:

```bash
npm run verify:preplaytest
```

That runs type checking, unit/regression tests, the 228-page campaign audit, semantic campaign lint and the full Acts 1–10 simulator. The exact split between automated coverage and checks that require a live Path of Exile session is maintained in `docs/PRE_PLAYTEST.md`.

Useful focused commands:

```bash
npm test
npm run audit:campaign
npm run lint:campaign
npm run simulate:campaign
npm run visual:manager
npm run visual:overlay
npm run soak:overlay
```

`npm run visual:manager` launches the real manager in a dedicated responsive-regression harness and captures Overview, Campaign, Settings and Diagnostics across representative desktop, scaled/compact and ultrawide viewports. It verifies horizontal overflow, real page scrolling, compact-sidebar fallback, ultrawide content width and Diagnostics readability.

`npm run visual:overlay` and `npm run soak:overlay` launch the real Electron overlay in dedicated test modes. The Windows GitHub Actions workflow runs the manager matrix, renders the overlay at 100%, 125% and 150% Chromium scale factors, checks DOM overflow, runs the overlay lifecycle soak, builds the installer, installs it into a clean directory, launches the installed application in smoke-test mode, and silently uninstalls it.

### Pre-playtest Lab

Run the application normally and open **Pre-playtest Lab** from the tray menu. The Lab can:

- preview any campaign page in Compact, Focus or Coach without changing real campaign progress;
- override simulated character and area levels;
- auto-walk through the campaign overlay for content review;
- replay a captured `Client.txt` through the real parser/progression pipeline without mutating live progress;
- export the latest replay as a JSON regression bundle with app/campaign provenance and route decisions.

Any real detection bug found during live play should be reduced to a captured fixture and kept as a permanent regression test.

Windows installer:

```bash
npm run dist
```

`release/` contains the NSIS setup executable. Portable distribution is intentionally not maintained.

## Application releases and updates

A version tag such as `v0.1.3` triggers `.github/workflows/release.yml`. The workflow refuses to publish unless the tag matches `package.json`, reruns deterministic verification, manager and overlay visual regression, overlay lifecycle soak and the installed-app smoke test, generates a SHA-256 checksum, and only then publishes the GitHub Release.

The installed application checks the public `Stoffe101/ExileQuesting` stable release feed, downloads the exact `ExileQuesting-<version>-setup.exe` asset, validates its reported size and GitHub-provided SHA-256 digest when available, then schedules the installer after ExileQuesting exits. No GitHub credential is embedded in the application.

A missing release or temporary GitHub outage never blocks application startup or campaign tracking.

See [docs/UPDATES.md](docs/UPDATES.md) for the release/update contract.

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

The bundled route contains 228 pages. `npm run audit:campaign` verifies that every page exposes at least one decisive structured-action signal and reports upstream token/jargon leakage candidates, bespoke guidance coverage, stale selector coverage, and warning coverage. High-value campaign coaching is maintained separately from the upstream route so upstream changes can be audited without replacing our teaching layer.

## What automation cannot replace

The remaining campaign-release checks need a real Path of Exile session and real Windows hardware:

- actual Client.txt event order/timing and any log forms not represented by fixtures;
- always-on-top and click-through behavior over the game;
- global hotkeys while PoE has focus;
- glance readability during combat;
- real multi-monitor and mixed-DPI placement;
- whether guidance appears at the right moment, not merely whether it is logically correct;
- final SmartScreen/end-user installer and update behavior.

## Project direction

The next major milestone after real campaign validation is **PoB to Play**: build-stage understanding, gem/vendor planning, passive milestones, link/socket transitions and build-specific campaign actions attached to the same semantic route model. A bounded PoB parser, pobb.in fetch service and persistent Build Profile foundation already exist.

Later modules include:

- build-specific LOOK FOR gear and socket/link guidance;
- leveling loot-filter generation;
- gear checkpoints and resistance repair;
- clipboard item parsing and Gear Coach;
- a step-by-step Crafting Coach with item-state validation.

See [docs/PRE_PLAYTEST.md](docs/PRE_PLAYTEST.md), [docs/RESEARCH.md](docs/RESEARCH.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/OVERLAY_V2.md](docs/OVERLAY_V2.md), and [docs/ROADMAP.md](docs/ROADMAP.md).

## Attribution and license

ExileQuesting is licensed for noncommercial use under **PolyForm Noncommercial License 1.0.0**. See [LICENSE](LICENSE) for the binding license reference and required notice.

Campaign data derived from Exile-UI remains subject to Exile-UI's MIT license and attribution. XileHUD was studied as a GPL-3.0 reference; no XileHUD source is incorporated into ExileQuesting. Third-party material is not relicensed by ExileQuesting's PolyForm terms. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
