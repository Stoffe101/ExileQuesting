# Roadmap

## 0.1 — campaign foundation

- [x] Acts 1–10 route snapshot
- [x] readable markup adapter
- [x] semantic annotation selectors
- [x] beginner/balanced/racer modes
- [x] full manager and campaign overlay
- [x] Client.txt/LatestClient.txt tracking
- [x] manual progress correction
- [x] league-start, optional, and bandit branches
- [x] update staging, validation, cache, and fallback
- [x] diagnostics and persistent logs
- [x] NSIS installer pipeline

## 0.1.1 — campaign experience + reliability

- [x] structured semantic route actions
- [x] NOW / NEXT / DON'T MISS glance hierarchy
- [x] independent Compact / Focus / Coach overlay presentation
- [x] typography presets and advanced overlay text sizing
- [x] content-driven overlay sizing
- [x] strict Client.txt event parser
- [x] filesystem watcher plus polling safety net
- [x] bounded startup-tail inspection and route reconciliation
- [x] confidence-rated progress decisions and undo history
- [x] Steam-library-aware log discovery
- [x] character/area level parsing and experience-band guidance
- [x] explicit passive/trial audit states instead of treating route progress as proof
- [x] confidence-rated layout-hint model
- [x] position presets, snapping/locking, DPI-safe display clamping
- [x] first-run onboarding and accessibility controls
- [x] live-run Overview, inspect-only Campaign browsing, expanded Diagnostics
- [x] live detection trace from Client.txt event to route decision
- [x] persistent campaign run timer, act splits, town time, previous run and PB
- [x] abnormal-shutdown recovery marker and renderer/child-process diagnostics
- [x] installed-app update check/download/restart-install flow
- [x] automated tag-driven GitHub Release workflow with installer checksum
- [x] installer-only Windows distribution; portable build retired
- [x] data-only compatibility manifest
- [x] semantic upstream CI report and campaign audit tooling
- [x] stale bespoke guidance selector audit and repair
- [x] expanded coaching for high-value bosses, quest items and permanent rewards

## 0.1.2 — pre-playtest simulator + hardening

- [x] deterministic full Acts 1–10 simulator using production campaign/progression code
- [x] league-start, optional-content and every bandit route variant in simulation
- [x] duplicate, display-name and backtrack/revisit event injection
- [x] recent-area history protection against false future progression
- [x] automatic progression skips disabled conditional route pages safely
- [x] deterministic Client.txt chunk/noise/fuzz replay
- [x] sandboxed Pre-playtest Lab with non-mutating Overlay Demo Mode
- [x] captured Client.txt replay UI and exportable versioned replay bundles
- [x] semantic campaign linter and route-action regression coverage
- [x] explicit persisted-settings schema migration and shared StateStore
- [x] updater malformed metadata/network/size/hash/interruption failure matrix
- [x] strict external/data URL allowlists and bounded remote responses
- [x] Windows overlay visual regression at 100%, 125% and 150% scale factors
- [x] Compact / Default / Large / Extra Large typography visual coverage
- [x] Electron overlay show/hide/resize lifecycle soak with CPU/memory baseline artifact
- [x] Windows NSIS build + clean silent install + packaged startup + silent uninstall gate
- [x] PoB XML/export/pobb.in parser foundation
- [x] bounded pobb.in raw-fetch service
- [x] persistent normalized Build Profiles and narrow IPC boundary
- [x] tagged releases rerun campaign simulation, semantic lint, overlay visuals, soak and installed-app smoke testing
- [ ] capture real full-campaign Client.txt fixtures during the first live run
- [ ] validate always-on-top/click-through/combat readability against Path of Exile
- [ ] real multi-monitor / mixed-DPI placement regression pass
- [ ] public release feed for end-user app updates (repo or dedicated release repo)
- [ ] expand reviewed layout hints and bespoke guidance where live testing identifies weak decisions

See `PRE_PLAYTEST.md` for the exact automation/live-test boundary.

## 0.2 — PoB to Play

The parser, bounded pobb.in fetcher and Build Profile persistence are already established by 0.1.2. This milestone turns that foundation into a player-facing planner.

- [ ] paste export code or pobb.in URL in the manager
- [ ] local `.xml` build discovery/import UX
- [ ] background import/decompression workflow
- [ ] stage-selection and active Build Profile UI
- [ ] class-aware quest reward and vendor plan
- [ ] link colours, socket counts, and gem transitions
- [ ] passive milestone overlay
- [ ] build notes and guide-source link
- [ ] build + character progress profiles
- [ ] attach build actions to the semantic campaign-action model

## 0.3 — build-aware campaign + loot intelligence

- [ ] build-specific vendor/gem reminders at campaign steps
- [ ] socket/link/colour targets from the active PoB stage
- [ ] concise LOOK FOR gear hints in the overlay
- [ ] build-specific vendor regex/search reminders
- [ ] leveling loot-filter generator
- [ ] richer `/passives` reconciliation workflow
- [ ] versioned layout images/diagrams where they beat text
- [ ] deeper personal route analytics without gameplay automation

## 0.4 — Gear Coach

- [ ] manually copied item parser
- [ ] resistance/attribute/life gap analysis
- [ ] gear-slot match score against build stage
- [ ] cheap campaign and early-map upgrade recommendations
- [ ] crafting-bench repair suggestions

## 0.5 — Crafting Coach

- [ ] licensed local modifier/base/essence/fossil/bench dataset
- [ ] essential/important/flexible target decomposition
- [ ] budget, recommended, high-end, and near-BiS strategies
- [ ] probabilities and expected attempts/cost
- [ ] explicit stop conditions
- [ ] item-state validation after manual Ctrl+C
- [ ] “just tell me” and “teach me” explanations
- [ ] optional supported Craft of Exile handoff/integration

## Release requirements for every milestone

- type check, runtime dependency audit, campaign audit, semantic campaign lint, full simulator and tests pass;
- Windows overlay visual matrix and lifecycle soak pass;
- Windows NSIS installer builds and survives an installed-app smoke test on GitHub Actions;
- packaged resource paths are exercised;
- startup and failure paths produce diagnostic logs;
- a release tag must match `package.json` version;
- public release assets must be generated by the tested release workflow, not uploaded ad hoc;
- current GGG policy boundary is rechecked;
- third-party data versions and licenses are recorded;
- no upstream campaign update activates without validation.
