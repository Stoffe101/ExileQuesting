# ExileQuesting v0.2.5

ExileQuesting 0.2.5 replaces the fragile in-game Passive Tree HUD direction with Campaign Guide 2: an app-owned campaign and build coaching experience that is easier to trust, easier to read, and no longer depends on passive-tree screen capture or calibration.

## Character continuity hardening

- Campaign progress, route history, permanent-reward confirmations, character level context, and linked build context are now stored per ExileQuesting character profile instead of sharing one global campaign cursor.
- Entering the **Act 1 Twilight Strand** creates a protected fresh-run profile immediately, so creating a new character after reaching a later act starts from the beginning instead of inheriting the previous character's progress.
- Act 6 Twilight Strand is explicitly distinguished from the level-1 Act 1 starting area and cannot trigger a campaign reset.
- Every fresh run has its own run-generation ID. If a deleted Path of Exile character name is later reused, the new run supersedes/archives the old same-name profile instead of inheriting its campaign state.
- Arbitrary named Client.txt level-up messages are never accepted as proof of the active character. This prevents party-member level-ups from silently claiming or switching a profile.
- A fresh/unnamed profile asks the player to confirm the exact Path of Exile character name once. After confirmation, only exact matching named level-up messages are accepted for that profile; explicit self-level events remain safe.
- Returning characters are restored conservatively using their saved profile, exact previous area, and nearby route context. If multiple profiles fit almost equally well, ExileQuesting refuses to guess and exposes an identity-recovery choice instead.
- Character Profiles now exposes the active character, Act/step, level, identity source/confidence/reason, linked build, last-seen time, manual switching, reset/delete controls, new-profile creation, ambiguity recovery, and archived superseded runs.
- Existing pre-character-aware global progress is migrated into a legacy character profile rather than discarded.
- Startup Client.txt reconciliation combines the latest entered-zone name with its preceding generated internal area ID/level when available, and can auto-show the campaign overlay when ExileQuesting starts while already inside a campaign zone.

## Character-bound builds

- Selecting or importing a PoB/Maxroll build while a character is active links that build profile to the character.
- Returning to that character restores the linked build context used by Passive Plan, gem guidance, Gear Coach, Build Doctor, and build-aware campaign guidance.
- Deleting a build removes stale character links without deleting campaign progress.

## Smaller Windows package

- The bundled Path of Building kernel is now staged as a **headless calculation runtime** instead of embedding PoB's full GUI image/runtime payload.
- Historical calculation data remains available for imported builds, while GUI images/fonts and unrelated desktop runtime binaries are excluded from the shipped bundle.
- The headless bundle has a hard **240 MiB uncompressed budget** so an accidental return to the old ~838 MB payload fails CI instead of silently bloating the installer.
- Windows acceptance now runs a real Path of Building `load-and-calculate` smoke against the stripped bundle before packaging, and repeats the installed PoB runtime smoke after the real updater handoff.

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
- Added global `Ctrl+K` navigation for Campaign, Character Profiles, zone diagrams, Passive Plan, permanent rewards, Build/Build Doctor, vendor helpers, Knowledge, Settings, Diagnostics, and the campaign overlay.

## Reliability and release safety

- Expanded automated manager coverage for Campaign Route, Act Map, Timeline, Completion Audit, I'M LOST, `Ctrl+K`, Passive Plan, zone diagrams, and character continuity surfaces.
- Added regression coverage for per-character campaign profiles, Act 1 versus Act 6 Twilight Strand detection, party-member/named versus explicit-self level parsing, reused-name run protection, ambiguity handling, build links, startup generated-area pairing, and restoring a saved later-act character instead of retaining another character's cursor.
- Retained Gear Coach, Build Doctor, normal campaign-overlay, and overlay-lifecycle visual/smoke gates.
- The packaged pinned PoB runtime is staged and exercised through real child processes before installer acceptance.
- Windows acceptance builds a real NSIS installer, verifies its exact package-version filename/ProductVersion, installs the latest public stable release, performs the updater handoff, relaunches the candidate, smokes the updated installed application, verifies the installed PoB calculation runtime, and uninstalls it.
- The updater rehearsal refuses equal-version or downgrade candidates.

ExileQuesting remains advisory. It does not inject into Path of Exile, read process memory, automate gameplay input, or replace the trade site/Craft of Exile.
