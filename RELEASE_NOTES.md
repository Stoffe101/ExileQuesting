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

## Per-character campaign continuity

- Campaign progress is now stored per character instead of sharing one global route cursor between every Path of Exile character.
- Entering the **Act 1 Twilight Strand** starts a fresh provisional campaign profile immediately, so creating a new character after reaching a later act no longer leaves the new character on the old route position.
- Client.txt character level-up lines are used to bind the provisional profile to the character name/class when that identity becomes available.
- Returning to a previously progressed character restores that character's saved route progress using known character identity when available and conservative saved-zone/route context when the log has not yet emitted a fresh identity line.
- Ambiguous character switches are handled conservatively rather than silently jumping to another character's route state.
- Existing pre-0.2.5 global progress is migrated into a legacy character profile rather than being discarded.
- Permanent-reward confirmations and route history follow the active character profile.
- Startup Client.txt reconciliation now combines the latest entered-zone name with its generated internal area ID/level when available.
- If ExileQuesting starts while the player is already inside a campaign zone, **Auto-show on zone change** can now open the campaign overlay from startup reconciliation instead of waiting for the next area transition.
- Act 6 Twilight Strand is explicitly distinguished from the level-1 Act 1 starting area so it cannot accidentally reset campaign progress.

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
- Added regression coverage for per-character campaign profiles, Act 1 versus Act 6 Twilight Strand detection, character-name/class parsing, startup generated-area identity pairing, and restoring a saved later-act character instead of retaining another character's cursor.
- Retained Gear Coach, Build Doctor, normal campaign-overlay, and overlay-lifecycle visual/smoke gates.
- The packaged pinned PoB runtime is staged and exercised through a real child process before installer acceptance.
- Windows acceptance builds a real NSIS installer, verifies its exact package-version filename/ProductVersion, installs the latest public stable release, performs the updater handoff, relaunches the candidate, smokes the updated installed application, verifies the installed PoB runtime, and uninstalls it.
- The updater rehearsal refuses equal-version or downgrade candidates.

ExileQuesting remains advisory. It does not inject into Path of Exile, read process memory, automate gameplay input, or replace the trade site/Craft of Exile.