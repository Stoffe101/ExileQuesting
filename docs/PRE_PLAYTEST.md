# Pre-playtest verification program

This document is the canonical checklist for work that should be completed before depending on a live Path of Exile campaign for validation.

The central principle is simple:

> A detection bug encountered once should become an offline regression test forever.

As of **v0.1.2**, the deterministic/automatable portion of this program is implemented. The unchecked items below deliberately require evidence from the real game, real Windows display hardware, or a real end-user release environment. The simulator and replay tools do not pretend to replace those tests; they make those tests focused and valuable instead of repetitive.

## 1. Full Acts 1–10 campaign replay simulator

- [x] Deterministic simulator using the same normalized `CampaignDataset` and progression engine as the application.
- [x] Exercise all ten acts.
- [x] Exercise league-start and non-league-start routes.
- [x] Exercise optional-content filtering.
- [x] Exercise all bandit profiles.
- [x] Inject duplicate internal-area events.
- [x] Inject duplicate display-name events.
- [x] Inject periodic backtrack/revisit probes.
- [x] Track recent areas so a real backtrack cannot be mistaken for a later copy of the same route area.
- [x] Ensure automatic completion lands on the next **enabled** route page across conditional branches.
- [x] Mix automatic zone progression with simulated manual completion of non-zone objectives.
- [x] Produce human-readable Markdown and machine-readable JSON reports.
- [x] Fail CI on unsafe progression.
- [ ] Add real captured full-campaign Client.txt fixtures after the first live run.

Run locally with:

```bash
npm run simulate:campaign
```

Generated reports are written to `artifacts/simulation/` and uploaded by CI.

## 2. Client.txt chaos and fuzz replay

- [x] Deterministic arbitrary filesystem chunk boundaries.
- [x] Duplicate log lines.
- [x] Large irrelevant log bursts.
- [x] Partial-line buffering.
- [x] Multi-megabyte noisy replay.
- [x] No invented character-level events from generic `level` text.
- [x] No backwards route progress.
- [x] Current-zone duplicate suppression.
- [x] Recent-area backtrack protection.
- [ ] Add captured examples of log replacement/truncation from a real PoE session when available.

## 3. Pre-playtest Lab / Overlay Demo Mode

- [x] Dedicated sandboxed Electron Pre-playtest Lab.
- [x] Preview any campaign page without mutating saved progress.
- [x] Previous/next demo page controls.
- [x] Override character level and area level.
- [x] Preview Compact / Focus / Coach independently from the real run.
- [x] Preview warnings, layout hints, permanent rewards and XP states from real route data.
- [x] Start/stop an automatic campaign walkthrough.
- [x] Replay an arbitrary captured Client.txt through the real parser/progression engine without mutating live progress.
- [x] Export the last replay as a versioned JSON bundle containing campaign provenance, parser events and progression decisions.
- [x] Render all replay-derived strings as text rather than HTML and deny Lab navigation/window creation.

The Lab is permanent development infrastructure for content review, screenshot generation and regression reproduction.

## 4. Visual/layout regression

- [x] Compact / Focus / Coach presentation coverage.
- [x] Compact / Default / Large / Extra Large typography coverage.
- [x] Short objective, long objective, warning-heavy, permanent-reward and coaching-heavy scenarios.
- [x] Automated Chromium scale-factor passes at 100%, 125% and 150%.
- [x] DOM-level horizontal-overflow assertions.
- [x] Screenshot bounds sanity checks.
- [x] PNG + manifest artifacts retained by Windows CI.
- [x] Visual matrix runs before installer packaging and again on tagged releases.
- [ ] Validate placement and readability on real mixed-DPI/multi-monitor Windows hardware against Path of Exile.

Run locally on Windows with:

```bash
npm run visual:overlay
```

Automated rendering is a guard rail, not a substitute for mixed-DPI Windows testing against the game.

## 5. Persistence and upgrade migration

- [x] Bounded JSON reads for user state.
- [x] Version-tolerant settings normalizer.
- [x] Explicit settings schema envelope and v0 → v1 migration path.
- [x] Missing-field defaults.
- [x] Unknown future fields ignored rather than trusted.
- [x] Typography, opacity and scale clamping.
- [x] Corrupt/malformed progress filtering.
- [x] Dataset-aware progress clamping after campaign load.
- [x] Bounded progress history.
- [x] Run-state recovery and bounded history.
- [x] Stale reward-confirmation filtering against current semantic step IDs.
- [x] Persistent normalized Build Profiles.
- [x] Reject oversized JSON before parsing.
- [x] User settings/progress/run/rewards/build profiles routed through the shared StateStore/normalizers.
- [x] Atomic state writes.

## 6. Updater failure simulation

- [x] No update / up-to-date.
- [x] Newer stable update.
- [x] Malformed version metadata.
- [x] Draft/prerelease rejection.
- [x] Missing installer rejection.
- [x] Wrong installer name rejection.
- [x] Non-GitHub and non-release download URL rejection.
- [x] Impossible/oversized installer metadata rejection.
- [x] Wrong downloaded file size rejection.
- [x] SHA-256 mismatch rejection.
- [x] Interrupted stream handling and temporary-file cleanup.
- [x] Timeout/abort/network failure handling.
- [x] Release-feed unavailable handling.
- [x] Install requested before a verified download is ready.
- [x] No GitHub credential embedded in the installed application.
- [ ] Validate SmartScreen and the final public release-feed/update journey on an end-user machine.

## 7. Diagnostic log replay

- [x] Core replay engine accepts arbitrary Client.txt chunks and produces decisions.
- [x] Deterministic chunk generator for reproducible bugs.
- [x] Pre-playtest Lab can select a captured Client.txt and replay it without mutating live progress.
- [x] Replay result reports line/chunk/event counts, errors, final route progress and the decision trace.
- [x] Export a replay bundle containing campaign source/version, parsed events/raw matched lines and progression decisions.
- [ ] Reduce each detection problem found during live testing to a committed regression fixture.

## 8. Campaign content QA

- [x] 228-page decisive-action audit.
- [x] Stale guidance selector failure in CI.
- [x] Semantic campaign linter.
- [x] Duplicate semantic step/action ID checks.
- [x] Invalid area/layout/annotation reference checks.
- [x] Permanent-reward metadata consistency checks.
- [x] Focus-action upstream-token leakage checks.
- [x] Route shorthand such as follow/reach/area references normalized to decisive travel actions.
- [x] Nested Exile-UI quest/level/arena tokens humanized before reaching action titles.
- [ ] Continue bespoke coaching/layout expansion only where real play identifies a decision ExileQuesting can save.

## 9. Architecture cleanup before PoB growth

- [x] Pure/testable route, action, progression, replay, persistence, PoB parsing, security and updater validation live outside renderer code.
- [x] Filesystem/network/window responsibilities extracted into Electron services.
- [x] Dedicated StateStore owns bounded/atomic user-state I/O.
- [x] PoB network import isolated behind a bounded Electron service.
- [x] Overlay window placement and lifecycle helpers isolated from route logic.
- [x] Pre-playtest Lab isolated from the normal manager UI.
- [x] New mutable IPC inputs validated/clamped at narrow boundaries.

`electron/main.ts` remains the application coordinator, but the new systems are implemented as reusable services/core modules rather than embedding their logic in that file.

## 10. Security/failure hardening

- [x] Bounded PoB input/XML sizes.
- [x] Strict `pobb.in/<id>` recognition and bounded `/raw` fetching.
- [x] Strict GitHub release asset validation and maximum installer size.
- [x] Bounded remote JSON/text responses.
- [x] Strict allowlists for renderer-opened external links and remote data URLs.
- [x] Settings/progress/demo/reward/PoB mutable IPC arguments validated or normalized.
- [x] Electron manager/overlay/Lab use context isolation, sandboxing and no renderer Node integration.
- [x] Renderer navigation/new-window creation denied unless explicitly allowlisted externally.
- [x] Lab never injects replay/log strings as HTML.
- [x] Remote compatibility configuration remains data-only, schema validated and incapable of code execution.

## 11. Stress / soak tests

- [x] Multi-megabyte noisy Client.txt replay.
- [x] Thousands of progress-history changes stay bounded.
- [x] Hundreds of completed runs stay bounded.
- [x] Real Electron overlay show/hide/resize soak in Windows CI.
- [x] Renderer liveness probes during the soak.
- [x] Main-process and renderer CPU/memory baseline artifact.

The first green Windows soak completed **220 lifecycle iterations** with **19 renderer probes** and no renderer death. In that run the main-process RSS moved from roughly **102.1 MB to 104.9 MB**. These numbers are a regression baseline, not a performance guarantee.

Run locally on Windows with:

```bash
npm run soak:overlay
```

## 12. PoB → Play parser/domain foundation

This work can proceed before live campaign testing because it is deterministic input processing.

- [x] Recognize PoB XML, export codes and strict `pobb.in/<id>` URLs.
- [x] URL-safe Base64 decoding.
- [x] zlib/deflate decompression with output-size guard.
- [x] Reject PoB2 when operating in PoE1 mode.
- [x] Parse class, ascendancy, level and target version.
- [x] Parse named Tree / Skill / Item stages.
- [x] Parse active skill groups and gem summaries.
- [x] Parse Notes.
- [x] Unit-test a real-format synthetic export envelope end-to-end.
- [x] Fetch `pobb.in/raw` through a bounded, allowlisted Electron network service.
- [x] Persist normalized Build Profiles with bounded profile count.
- [x] Expose narrow preload IPC for list/import/delete profile operations.
- [ ] Build the user-facing PoB-to-Play planner, vendor/gem reward plan and campaign Build actions after the live campaign foundation validation.

## Automated exit gate

A candidate pre-playtest build is not accepted unless:

- [x] Production dependency audit passes.
- [x] TypeScript typecheck passes.
- [x] Unit/regression/stress tests pass.
- [x] Campaign structural audit passes.
- [x] Semantic campaign linter passes.
- [x] Every configured Acts 1–10 simulation profile passes.
- [x] Production renderer/Electron build passes.
- [x] Windows 100%/125%/150% visual matrix passes.
- [x] Windows Electron overlay lifecycle soak passes.
- [x] NSIS installer builds as exactly one setup executable.
- [x] Installer silently installs into a clean directory.
- [x] The installed application passes packaged startup smoke testing.
- [x] Silent uninstall succeeds.

The same high-value validation is included in the tagged release workflow before a release is published.

## What still genuinely requires Path of Exile or an end-user machine

1. Real GGG Client.txt event order/timing and any log forms not represented by synthetic/captured fixtures yet.
2. Always-on-top behavior against the actual game window.
3. Click-through and interaction hotkeys while playing.
4. Human glance-readability under combat pressure.
5. Multi-monitor and mixed-DPI placement on real Windows hardware.
6. Whether guidance appears at the most useful moment rather than merely being technically correct.
7. Expanding contextual coaching/layout hints based on decisions actually encountered during a run.
8. SmartScreen and the final installed-update journey from a public release feed on an end-user machine.

Everything else in this milestone is expected to stay deterministic and continuously regression-tested.
