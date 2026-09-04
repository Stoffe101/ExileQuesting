# ExileQuesting v0.2.5

ExileQuesting 0.2.5 replaces the fragile in-game Passive Tree HUD direction with Campaign Guide 2: an app-owned campaign and build coaching experience that is easier to trust, easier to read, and no longer depends on passive-tree screen capture or calibration.

## Campaign Guide 2

- Added a new campaign manager built around clear **NOW / THEN / DON'T MISS / BUILD** instructions.
- Added explicit permanent-progression guidance such as **Passive skill point quest here**, **Complete the Ascendancy Trial in this area**, and **Run the Normal/Cruel/Merciless Labyrinth now**.
- Labyrinth runs are now semantically distinct from Trials of Ascendancy instead of inheriting the same upstream marker behavior.
- Added route importance levels, permanent-reward/build filters, an Act Map, progression Timeline, and Campaign Completion Audit.
- Added **I'M LOST** recovery with non-destructive **REVISITING** and **CATCHING UP** states so detours do not corrupt furthest saved progress.
- `/passives` is now a critical end-of-campaign verification action rather than background context.
- Added simplified **Minimal / Standard / Teach Me** experience presets while preserving advanced overlay controls.

## Passive Plan

- Replaced the in-game passive-tree drawing UX with a full ExileQuesting-owned Passive Plan.
- Maxroll profiles can expose exact ordered **Take / Refund** operations with an undoable ExileQuesting acknowledgement cursor.
- Path of Building profiles expose trustworthy stage-difference targets, allocation counts, masteries, and compatible node names without inventing a click order PoB does not author.
- Passive Plan is directly available from Overview, Campaign Guide, and `Ctrl+K`.
- Passive guidance never clicks Path of Exile, reads process memory, or relies on OCR/tree recognition.

## Passive Tree HUD retirement

The old Passive Tree HUD is removed from the shipping runtime rather than merely hidden:

- removed the Passive Tree HUD capture/tracking service;
- removed the full-screen HUD BrowserWindow and its content-protection surface;
- removed the passive-tree HUD renderer mode, component, CSS, and dedicated visual harness;
- legacy persisted HUD settings remain only for migration compatibility and are forced off.

Passive-tree data/model support remains where it is legitimately used by Passive Plan, PoB integration, and Build Doctor.

## Route correctness

- ExileQuesting now mirrors Exile-UI's line-level `leaguestart:` / `twinkrun:` semantics instead of only handling structured route conditions.
- The selected route mode is materialized consistently for the Campaign UI, permanent-reward audit, Client.txt automatic progression, startup reconciliation, and campaign simulation.
- Stable route step IDs/progress indexes are preserved while hidden opposite-mode actions, target areas, tags, and reward semantics are removed.
- Campaign semantic lint validates league-start and twink routes independently and rejects hidden-line leakage.

## Zone and build guidance

- Added a current-zone diagram for every route step. Objective flow remains available even when no trustworthy spatial hint exists.
- Layout knowledge now carries explicit `verified`, `reviewed`, `unaudited`, or `outdated` state instead of being presented as an exact procedural map.
- Added contextual build gem, crafting, vendor-search, Passive Plan, and Build Doctor entry points throughout the campaign experience.
- Added global `Ctrl+K` navigation for Campaign, zone diagrams, Passive Plan, permanent rewards, Build/Build Doctor, vendor helpers, Knowledge, Settings, Diagnostics, and the campaign overlay.

## Reliability and release safety

- Expanded automated manager coverage for Campaign Route, Act Map, Timeline, Completion Audit, I'M LOST, `Ctrl+K`, Passive Plan, and zone diagrams at 1280x720.
- Retained Gear Coach, Build Doctor, normal campaign-overlay, and overlay-lifecycle visual/smoke gates.
- The packaged pinned PoB runtime is staged and exercised through a real child process before installer acceptance.
- Windows acceptance builds a real NSIS installer, verifies its exact package-version filename/ProductVersion, installs the latest public stable release, performs the updater handoff, relaunches the candidate, smokes the updated installed application, verifies the installed PoB runtime, and uninstalls it.
- The updater rehearsal refuses equal-version or downgrade candidates.

## Validated 0.2.5 candidate

Validated branch head: `a71d61d1243fd72e823d8f51e2b3feef62d16c59`

- Linux CI: PASS.
- 73 test files / 415 tests: PASS.
- Campaign audit: 228/228 route pages contain decisive structured guidance.
- Dual-mode campaign lint: 0 errors / 0 warnings.
- League-start, optional-hidden, twink, and all bandit simulations: PASS.
- Manager, Gear Coach, Build Doctor, and overlay visual gates: PASS.
- Overlay lifecycle soak: PASS.
- Pinned PoB runtime and child-process health: PASS.
- NSIS package: **ExileQuesting-0.2.5-setup.exe**.
- Installer size: 717,955,167 bytes.
- Real public-stable updater rehearsal: **v0.2.4 -> v0.2.5** PASS.
- Updated installed ProductVersion: **0.2.5.0**.
- Updated installed PoB runtime: PASS.
- Windows acceptance workflow: `33890053090` PASS.

ExileQuesting remains advisory. It does not inject into Path of Exile, read process memory, automate gameplay input, or replace the trade site/Craft of Exile.
