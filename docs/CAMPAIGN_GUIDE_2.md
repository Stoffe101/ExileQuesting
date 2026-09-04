# Campaign Guide 2

Campaign Guide 2 is the post-Passive-Tree-HUD direction for ExileQuesting. The goal is not to add more overlay machinery. The goal is to make the route, build and permanent character progression feel like one coherent coach.

## Product rule

ExileQuesting should answer five questions in order:

1. **NOW** — what should the player physically do next?
2. **THEN** — what are the next few actions in this route step?
3. **DON'T MISS** — what creates a costly return trip or permanent-power miss if skipped?
4. **BUILD** — what does the active build need at this exact campaign moment?
5. **WHY / FAST ROUTE / LAYOUT** — optional context, progressively disclosed.

Critical information is never hidden behind Beginner/Balanced/Racer wording depth.

The semantic campaign lint enforces that all bundled route pages have decisive structured actions and that critical permanent-progression semantics cannot silently disappear.

## Permanent progression language

These are explicit semantic instructions, not generic route prose:

- **Passive skill point quest here** — complete the quest and claim the Book of Skill.
- **Complete the Ascendancy Trial in this area** — finish the local trial while already in the zone.
- **Run the Normal/Cruel/Merciless Labyrinth now** — this is a Labyrinth run that awards Ascendancy points, not another trial.
- **Grab the waypoint before leaving** — the route expects this waypoint as a return/progression anchor.
- **Build milestone here** — buy/take/swap the build component whose source is unlocked by this route step.

Labyrinth runs and Trials of Ascendancy are deliberately distinct. The upstream Exile-UI route uses the same `img:lab` marker for both in some places, so ExileQuesting additionally recognizes `normal_lab`, `cruel_lab`, `merciless_lab` and `eternal_lab` route tokens before assigning trial semantics.

## Passive Plan replaces the tree HUD

The in-game passive-tree drawing/capture architecture is retired.

Passive Plan uses existing build-source evidence:

- ordered Maxroll operations say exactly **Take X** or **Refund Y** and use an explicit, undoable ExileQuesting acknowledgement cursor;
- Path of Building stages show trustworthy stage-difference targets, allocation counts and masteries;
- bundled passive-tree node names are only applied when the PoB/tree versions are compatible;
- when PoB does not author a safe click order, ExileQuesting does not invent one.

`Ctrl+K → Open Passive Plan` opens the full Passive Plan surface. Its controls update ExileQuesting's build-plan cursor only. They do not click Path of Exile.

The passive HUD runtime is not started during normal application startup. ExileQuesting no longer creates the retired full-screen Passive Tree HUD BrowserWindow, so its old content-protection/capture surface cannot interfere with recording. Legacy settings/types remain temporarily only so older persisted settings can migrate safely.

## Route recovery

Detected local context and saved furthest progress are separate concepts.

When the player returns to an earlier route area, show **REVISITING** and local objective/layout help without moving saved progress backward.

When the player reaches an area beyond the saved route, show **CATCHING UP** and expose missed/unfinished permanent objectives before offering to resume there. Never silently skip important steps.

The **I'M LOST** panel shows:

- detected area;
- saved current objective;
- best available layout/objective clue;
- next objective;
- route-passed but unconfirmed permanent rewards;
- previous/current route recovery actions.

Startup reconciliation follows the same rule: a detected zone may be offered as a resume point, but the user chooses whether it replaces saved route progress.

## Zone diagrams and layout knowledge

`Ctrl+K → Open current zone diagram` works for every current route step. It always shows the structured objective flow. When maintained spatial knowledge exists, it also surfaces that layout clue. When no trustworthy spatial hint exists, the diagram says so rather than manufacturing a map.

Spatial layout hints carry an explicit audit state:

- `verified` — live/current verification exists;
- `reviewed` — research-reviewed for the recorded game version, but not yet promoted to live verification;
- `unaudited` — legacy or newly imported knowledge that must remain lower priority;
- `outdated` — excluded from normal guidance.

Selection prefers audit quality before prose confidence. Reviewed/verified hints require game-version and audit-date metadata. Outdated hints may not remain enabled.

Current 3.29 ExileQuesting layout hints are conservatively marked **reviewed**, not verified. Inline sketches and the full zone diagram explicitly say they are not exact generated maps. Community layout images are research references only; Campaign Guide 2 does not redistribute Engineering Eternity/community diagram artwork.

## Campaign + build fusion

Campaign and build progression are one timeline.

At the route step where a build-relevant quest/vendor becomes available, show the exact build action. Build-aware vendor searches and contextual crafting hints appear there too. Existing class-aware gem acquisition, Maxroll/PoB stages, loot targets, crafting hints and vendor-search plans remain the evidence sources.

## Completion audit

Near campaign completion, show a maps handoff audit rather than ending abruptly.

Evidence-backed checks include:

- confirmed passive quest rewards;
- confirmed Ascendancy Trials;
- active build stage and unresolved gem acquisition state;
- build-aware leveling gear hints.

Labyrinth/Ascendancy-point completion is deliberately shown as a **manual/unknown** check because route progress and Client.txt do not prove that the player actually completed a Labyrinth and took the Ascendancy points.

Unknown state stays unknown. Do not claim resistances, Labyrinth completion, flask correctness or maps readiness unless a trusted data path actually proves those facts.

## Experience presets

Default setup is simplified to:

- **Minimal** — racer guidance + Compact overlay;
- **Standard** — balanced guidance + Focus overlay;
- **Teach Me** — beginner guidance + Coach overlay.

Advanced controls remain available for overlay scale, opacity, placement, typography, density, click-through, locking and accessibility.

## Global search

`Ctrl+K` is the common doorway into Campaign, current zone diagrams, Passive Plan, permanent reward audit, Build/Build Doctor, vendor helpers, Knowledge, Settings, Diagnostics and the campaign overlay.

Search actions are application navigation. They never type into Path of Exile or automate gameplay.

## Build Doctor on Overview

Overview may surface deterministic Build Doctor findings for the active build. It must use the existing PoB-backed Doctor analysis and may not fabricate a universal build score. If the deterministic runtime or relevant evidence is unavailable, Overview says so.

## Research adopted, not copied

The design pass reviewed current Exile-UI, PoE Overlay Campaign Guide, Exile Compass and PoE Campaign Copilot behavior.

Useful patterns adopted conceptually:

- reward-type filters and objective emphasis;
- a route/world-map style overview instead of only a flat step list;
- permanent reward checklists;
- build/gem reminders at the campaign moment they become relevant;
- abstract layout diagrams with explicit uncertainty and audit state;
- off-route `revisiting` / `catching up` state that does not corrupt furthest progress;
- a global command/search surface;
- explicit user-triggered vendor regex copy.

No third-party guide wording, diagrams or code are copied into Campaign Guide 2 by this research pass.

## Explicit non-goals for this phase

Do not restart the complexity spiral by adding:

- passive-tree screen recognition;
- minimap recognition;
- OCR everywhere;
- gameplay automation;
- a full trade-site replacement;
- a full Craft of Exile replacement;
- an unrestricted plugin ecosystem;
- AI chat pasted onto every screen;
- settings merely because another application exposes them.

Voice control remains a later accessibility/convenience idea. It is intentionally not part of the Campaign Guide 2 completion gate.
