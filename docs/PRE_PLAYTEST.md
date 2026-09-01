# Pre-playtest verification program

This document is the canonical checklist for work that should be completed before depending on a live Path of Exile campaign for validation.

The central principle is simple:

> A detection bug encountered once should become an offline regression test forever.

The simulator and replay tools do not claim to replace every real-game test. They are designed to remove as much repetitive manual validation as possible so live playtesting can focus on the things only the actual game/Windows environment can reveal.

## 1. Full Acts 1–10 campaign replay simulator

- [x] Deterministic simulator using the same normalized `CampaignDataset` and progression engine as the application.
- [x] Exercise all ten acts.
- [x] Exercise league-start and non-league-start routes.
- [x] Exercise optional-content filtering.
- [x] Exercise all bandit profiles.
- [x] Inject duplicate internal-area events.
- [x] Inject duplicate display-name events.
- [x] Inject periodic backtrack/revisit probes.
- [x] Mix automatic zone progression with simulated manual completion of non-zone objectives.
- [x] Produce a human-readable and JSON report.
- [x] Fail CI on unsafe progression.
- [ ] Add real captured Client.txt campaign fixtures after the first live run.

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
- [x] No invented character-level events from generic `level` text.
- [x] No backwards route progress.
- [x] Current-zone duplicate suppression.
- [ ] Add captured examples of log replacement/truncation from a real PoE session when available.

## 3. Overlay Demo Mode

Target behavior:

- Preview any campaign page without mutating saved progress.
- Previous/next demo page controls.
- Override character level and area level.
- Preview Compact / Focus / Coach independently from the real run.
- Show warnings, layout hints, permanent rewards, XP states and long/short objective examples.
- Start/stop an automatic campaign walkthrough.

This should remain useful permanently for content review, screenshot generation and bug reports.

## 4. Visual/layout regression

Target matrix:

- Compact / Focus / Coach.
- Typography Compact / Default / Large / Extra Large.
- short objective, long objective, warning-heavy page and coaching-heavy page.
- representative 1080p, 1440p and scaled/high-DPI viewport sizes.
- detect clipping, unexpected scrollbars, giant empty panels and overflowing controls.

Automated rendering is a guard rail, not a substitute for mixed-DPI Windows testing against the game.

## 5. Persistence and upgrade migration

- [x] Version-tolerant settings normalizer.
- [x] Missing-field defaults.
- [x] Typography and scale clamping.
- [x] Corrupt/malformed progress filtering.
- [x] Bounded progress history.
- [x] Run-state recovery and bounded history.
- [x] Stale reward-confirmation filtering foundation.
- [x] Reject oversized JSON before parsing.
- [ ] Wire every Electron persistence loader through the shared normalizers.
- [ ] Add explicit schema-version migrations when a breaking persisted format is introduced.

## 6. Updater failure simulation

Required cases:

- no update / up-to-date;
- newer update;
- malformed version;
- draft/prerelease;
- missing installer;
- wrong installer name;
- unsafe download URL;
- impossible/oversized installer metadata;
- wrong file size;
- SHA-256 mismatch;
- interrupted download;
- timeout/network failure;
- release feed unavailable;
- install requested before a verified download is ready.

No GitHub credential may ever be embedded in the installed application.

## 7. Diagnostic log replay

- [x] Core replay engine accepts arbitrary Client.txt chunks and produces decisions.
- [x] Deterministic chunk generator for reproducible bugs.
- [ ] Add manager UI for selecting a captured Client.txt and replaying it without mutating live progress.
- [ ] Export a replay bundle containing source events, parser results and progression trace.

Any real-world detection failure should be reduced to a fixture and committed as a regression test.

## 8. Campaign content QA

- [x] 228-page decisive-action audit.
- [x] stale guidance selector failure in CI.
- [x] semantic campaign linter foundation.
- [x] duplicate semantic IDs/action IDs checks.
- [x] invalid area/layout/annotation reference checks.
- [x] permanent-reward metadata consistency checks.
- [x] Focus-action upstream-token leakage checks.
- [ ] Continue bespoke coaching/layout expansion only where it saves decisions during real testing.

## 9. Architecture cleanup before PoB growth

- Keep pure/testable route, progression, replay, persistence, PoB and updater validation under `src/core/`.
- Keep filesystem/network/window responsibilities in Electron services.
- Avoid turning `electron/main.ts` or `src/ui/App.tsx` into catch-all modules.
- New feature state should have explicit IPC boundaries and input validation.

## 10. Security/failure hardening

- [x] bounded PoB input/XML sizes.
- [x] strict pobb.in URL recognition.
- [x] strict GitHub release asset validation.
- [x] bounded settings JSON helper.
- [ ] allowlist all external links opened from renderer-controlled values.
- [ ] route every mutable IPC argument through explicit validation/clamping.
- [ ] enforce response-size limits on future PoB/remote-data fetches.
- [ ] keep remote configuration data-only and incapable of code execution.

## 11. Stress / soak tests

- [x] multi-megabyte noisy Client.txt replay.
- [x] thousands of progress-history changes stay bounded.
- [x] hundreds of completed runs stay bounded.
- [ ] long-running renderer/overlay show-hide-resize soak test in Electron CI.
- [ ] record rough CPU/memory baselines after the first installed-app soak run.

## 12. PoB → Play parser/domain foundation

This work can proceed before live campaign testing because it is deterministic input processing.

- [x] recognize PoB XML, export codes and strict `pobb.in/<id>` URLs.
- [x] URL-safe Base64 decoding.
- [x] zlib/deflate decompression with output-size guard.
- [x] reject PoB2 when operating in PoE1 mode.
- [x] parse class, ascendancy, level and target version.
- [x] parse named Tree / Skill / Item stages.
- [x] parse active skill groups and gem summaries.
- [x] parse Notes.
- [x] unit-test a real-format synthetic export envelope end-to-end.
- [ ] fetch pobb.in `/raw` through a bounded Electron network service.
- [ ] persist Build Profiles.
- [ ] build vendor/gem reward planning and campaign Build actions after live campaign foundation validation.

## What still genuinely requires Path of Exile running

1. Real GGG Client.txt event order/timing and any unrepresented log forms.
2. Always-on-top behavior against the actual game window.
3. Click-through and interaction hotkeys while playing.
4. Human glance-readability under combat pressure.
5. Multi-monitor and mixed-DPI placement on real Windows hardware.
6. Whether guidance appears at the most useful moment rather than merely being technically correct.
7. SmartScreen and final installed-update behavior on an end-user machine.

Everything else should be pushed toward deterministic automated coverage first.
