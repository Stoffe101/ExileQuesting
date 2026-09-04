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

- ordered Maxroll operations can say exactly **Take X** or **Refund Y**;
- Path of Building stages can describe trustworthy passive milestones;
- when PoB does not author a safe click order, ExileQuesting must not invent one;
- the manager can later grow an internal tree viewer, but guidance must never depend on screen calibration, OCR or vision tracking.

The retired compatibility service does not start desktop capture, passive-tree vision, point-cloud registration, tracking timers or PoE-window polling.

## Route recovery

Detected local context and saved furthest progress are separate concepts.

When the player returns to an earlier route area, show **REVISITING** and local objective/layout help without moving saved progress backward.

When the player reaches an area beyond the saved route, show **CATCHING UP** and expose missed/unfinished permanent objectives before offering to resume there. Never silently skip important steps.

The **I'M LOST** panel should show:

- detected area;
- saved current objective;
- best available layout/objective clue;
- next objective;
- route-passed but unconfirmed permanent rewards;
- previous/current route recovery actions.

## Layout diagrams

Prefer a small diagram when spatial information beats prose, but never imply deterministic layouts where PoE generates variants.

Initial diagrams are abstract ExileQuesting route sketches derived from maintained layout hints. They must display confidence and the phrase **Route sketch, not an exact map**. Community images from other tools are research references only unless their exact asset license and attribution requirements are reviewed for redistribution.

## Campaign + build fusion

Campaign and build progression should not be separate timelines.

At the route step where a build-relevant quest/vendor becomes available, show the exact build action. Build-aware vendor searches and contextual crafting hints should appear there too. Existing class-aware gem acquisition, Maxroll/PoB stages, loot targets, crafting hints and vendor-search plans remain the evidence sources.

## Completion audit

Near campaign completion, show a maps handoff audit rather than ending abruptly.

Current evidence-backed checks include:

- confirmed passive quest rewards;
- confirmed Ascendancy Trials;
- active build stage and unresolved gem acquisition state;
- build-aware leveling gear hints.

Unknown state stays unknown. Do not claim resistances, Labyrinth completion, flask correctness or maps readiness unless a trusted data path actually proves those facts.

## Experience presets

Default setup is simplified to:

- **Minimal** — racer guidance + Compact overlay;
- **Standard** — balanced guidance + Focus overlay;
- **Teach Me** — beginner guidance + Coach overlay.

Advanced controls remain available for users who need them.

## Global search

`Ctrl+K` is the common doorway into Campaign, Passive Plan, permanent reward audit, Build/Build Doctor, vendor helpers, Knowledge, Settings, Diagnostics and the campaign overlay.

Search actions are application navigation. They never type into Path of Exile or automate gameplay.

## Research adopted, not copied

The design pass reviewed current Exile-UI, PoE Overlay Campaign Guide, Exile Compass and PoE Campaign Copilot behavior.

Useful patterns adopted conceptually:

- reward-type filters and customizable objective emphasis;
- a route/world-map style overview instead of only a flat step list;
- permanent reward checklists;
- build/gem reminders at the campaign moment they become relevant;
- abstract layout diagrams with explicit uncertainty;
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

Voice control remains a later accessibility/convenience idea. The product should first be excellent with mouse, keyboard and existing log/build data.
