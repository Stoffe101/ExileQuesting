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
- [x] public anonymous GitHub Releases update feed
- [ ] capture real full-campaign Client.txt fixtures during the first live run
- [ ] validate always-on-top/click-through/combat readability against Path of Exile
- [ ] real multi-monitor / mixed-DPI placement regression pass
- [ ] expand reviewed layout hints and bespoke guidance where live testing identifies weak decisions

See `PRE_PLAYTEST.md` for the exact automation/live-test boundary.

## 0.1.4 — Lab + updater reliability hotfix

- [x] replace inert Lab renderer with the packaged React/Vite renderer and sandboxed preload bridge
- [x] exercise Preview, Auto Walk and all six campaign simulator profiles through real Lab IPC in CI
- [x] Full Acts 1–10 Simulator UI and report export in the Lab
- [x] hidden detached file-based Windows updater handoff
- [x] bounded parent-process wait with failure trace instead of hanging shell pipeline
- [x] installer exit-code and installed-executable verification
- [x] relaunch command verification plus a real post-update ExileQuesting process assertion in CI
- [x] real previous-stable -> candidate upgrade rehearsal before package/release acceptance
- [x] v0.1.4 public installer + SHA-256 checksum published from verified commit `d1f59724cc28848e8139cb713c8d8828499fe00e`

## 0.2 — Player Coach / PoB to Play

v0.2 turns the build foundation into an active leveling companion. PoB and Maxroll are both first-class build sources, build stages drive overlay/loot/crafting guidance, and Gear Coach can evaluate manually copied items against the active stage without gameplay automation.

### Stage model

- [x] parse modern passive specs by ordinal instead of inventing IDs from `treeVersion`
- [x] preserve independent native IDs for skill/item/config sets without assuming cross-family ID equality
- [x] parse configuration sets as a fourth PoB stage family
- [x] preserve passive-stage tree version, class/ascendancy IDs, allocated node IDs and mastery selections
- [x] parse stage-specific PoB equipment and shared item-catalog references
- [x] preserve empty/self-closing PoB item stages without dropping stage metadata
- [x] migrate v0.1 Build Profiles that predate config-stage parsing
- [x] confidence-rated stage alignment: exact loadout title -> semantic milestone -> guarded ordinal fallback -> explicit ambiguity
- [x] recognize PoB linked-title `{token}` convention
- [ ] validate stage alignment against a broader corpus of current real-world PoBs
- [x] active Build Stage selection and persistence

### Import + interpretation

- [x] paste export code or pobb.in URL in the manager
- [x] local `.xml` build import through a bounded desktop file picker
- [x] import public Maxroll PoE leveling-guide URLs as first-class Build Profiles
- [x] support normal and Twink Maxroll planner schemas with bounded public fetches
- [x] surface Maxroll guide links, imported-source information and PoB notes in the planner
- [ ] background import/decompression workflow
- [ ] character-linked Build Profiles

### Leveling plan

- [x] versioned gem metadata snapshot with provenance
- [x] class-aware quest reward plan
- [x] class-aware vendor availability plan
- [x] Siosa/Lilly fallback acquisition rules
- [x] gem transition planner
- [x] link-count + optional socket-colour quality targets from the active PoB stage, using PoE 3.29 semantics
- [x] passive milestone diff between aligned tree stages with version-safe named targets
- [x] attach build actions to the semantic campaign-action model
- [x] concise BUILD block in Compact/Focus/Coach overlays
- [x] exact Maxroll next-passive/refund coaching with persisted manual cursor
- [x] character-level-driven Maxroll skill/gem stage activation
- [x] canonicalize Maxroll gem IDs/names through bundled PoE game data
- [x] preserve Twink equipment slot/item/base/unique references for future item-data resolution
- [x] stage-aware LOOK FOR gear hints in manager and overlay

### Gear Coach

- [x] parse manually copied Path of Exile item text locally
- [x] recognize common single/combined life, resistance, attribute, movement, defense and offense signals
- [x] derive sockets and maximum linked group from copied item text
- [x] compare copied items against current PoB stage equipment/base targets
- [x] use active skill link requirements as build-stage evidence
- [x] account for detected character-level requirements
- [x] produce conservative 0–100 equip/situational/skip guidance with positive and negative reasons
- [x] provide safe campaign bench-repair suggestions without claiming hidden affix knowledge
- [x] explicit clipboard analysis action; no continuous clipboard monitoring or automatic gameplay actions
- [x] dedicated Windows Gear Coach renderer/overflow visual smoke gate

### Build-aware loot + crafting

- [x] build-specific vendor/gem reminders at campaign steps
- [x] active-stage link-count targets plus optional 3.29 socket-colour quality bonuses
- [x] concise LOOK FOR target-base hints beyond links/recipes
- [x] stage-specific base/unique names feed narrow leveling-filter rules when safely representable
- [x] leveling loot-filter generator safely wraps an existing local filter
- [x] campaign crafting intelligence for current bench recipes, Act 2+ town benches and Kitava resistance preparation
- [ ] build-specific vendor regex/search reminders
- [ ] richer `/passives` reconciliation workflow
- [ ] versioned layout images/diagrams where they beat text
- [ ] deeper personal route analytics without gameplay automation
- [ ] endgame/economy-aware loot intelligence beyond the campaign-scoped wrapper

### Data quality

- [ ] version every generated game-data snapshot independently from the application
- [ ] unify game version, schema version, generated-at, source revision/URL and checksum metadata across every generated snapshot
- [x] keep runtime operation independent of PoE Wiki availability
- [x] regression-test known quest/vendor edge cases and class restrictions
- [x] pin and validate a packaged PoE 3.29 passive-tree snapshot with source URL and SHA-256 provenance
- [x] refuse to apply current passive-node names when an imported PoB targets a different tree version

See `BUILD_INTELLIGENCE.md` for the build-aware planner, passive, crafting and loot-filter behavior.

## 0.3 — deeper route + endgame intelligence

- [ ] current-patch real-world PoB corpus validation and heuristics hardening
- [ ] character-linked build profiles when a reliable identity source is available
- [ ] build-specific vendor regex/search reminders
- [ ] richer `/passives` reconciliation workflow
- [ ] more reviewed high-confidence layout and routing hints
- [ ] deeper personal route analytics without gameplay automation
- [ ] endgame/economy-aware loot intelligence beyond the campaign-scoped wrapper

## 0.4 — Advanced Gear Coach

- [x] manually copied item parser foundation
- [x] visible resistance/attribute/life analysis
- [x] gear-slot/build-stage match score
- [x] cheap campaign repair suggestions
- [x] compare candidate against an explicitly copied currently equipped item
- [ ] richer weapon-specific build weighting from local modifier/base data
- [ ] exact unique/base resolution for Maxroll internal item metadata
- [ ] early-map and endgame upgrade recommendations

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

- typecheck, runtime dependency audit, campaign audit, semantic campaign lint, full simulator and tests pass;
- generated gem and passive snapshots validate before packaging;
- Windows manager responsive matrix, Gear Coach visual smoke, overlay visual matrix and lifecycle soak pass;
- Windows NSIS installer builds successfully;
- when a previous stable release exists, CI installs that release and proves the real updater can move it to the candidate build;
- the relaunched ExileQuesting process must actually be observed after update, not merely requested;
- the upgraded installed executable reports the candidate version and survives a packaged startup smoke test before uninstall;
- packaged resource paths are exercised;
- startup, updater and failure paths produce diagnostic logs;
- a release tag must match `package.json` version;
- public release assets must be generated by the tested release workflow, not uploaded ad hoc;
- current GGG policy boundary is rechecked;
- third-party data versions and licenses are recorded;
- no upstream campaign update activates without validation.
