# Passive Tree HUD

Passive Tree HUD is ExileQuesting's visual bridge between imported build guidance and Path of Exile's in-game passive tree.

The HUD never moves the cursor, clicks nodes, reads process memory, injects into Path of Exile, or allocates/refunds a passive.

## Product requirement

When the Path of Exile passive tree is open, ExileQuesting should show the next supported passive target on the real in-game node and keep following that node while the player uses the tree normally.

Normal interaction includes:

- zooming in;
- zooming out;
- dragging/panning left, right, up or down;
- moving the target offscreen and back onscreen;
- closing and reopening the passive tree.

A player must not have to repeatedly recalibrate just because they panned or zoomed. When the target is offscreen, the HUD should use an edge indicator pointing toward it. When it becomes visible again, the marker should return to the real node.

## Source-of-truth hierarchy

Passive-tree geometry follows this hierarchy:

1. Grinding Gear Games supplies the raw passive-tree data.
2. Path of Building Community is the canonical reference for how that data is interpreted and laid out, including class starts, group/orbit geometry and Ascendancy normalization.
3. Exile-UI informs the lightweight in-game passive-tree screen-check workflow.

The bundled 3.29 passive snapshot is validated against pinned PoB reference invariants before a build can pass.

## Tree-open detection

ExileQuesting follows the proven Exile-UI pattern of inspecting a tiny, client-relative static UI region near the top-center of the PoE 1 passive-tree screen.

For PoE 1 the normalized reference region is:

- x: centered horizontally;
- y: `0.054 * clientHeight`;
- width: `clientHeight / 16`;
- height: `0.02 * clientHeight`.

A one-time screen reference stores a small grayscale signature from that static region. Runtime polling compares the same sample grid and requires two consecutive matches before the transparent HUD window is shown.

This check answers only one question: **is the passive-tree UI actually visible?**

Node detection and tracking are never allowed to decide that ordinary gameplay is a passive tree. This prevents the old false positives where flask/skill/UI circles could make the passive HUD appear during gameplay.

## Live node tracking

Once the passive-tree screen check has positively matched, ExileQuesting may inspect passive-node circles inside that already-confirmed tree screen.

This is deliberately narrower than the old v0.2.4 design. Vision is not used to discover whether the player is looking at a tree. It is used only to solve the current scale and translation of a known PoB/GGG node constellation.

The tracker works in two stages:

1. **Local tracking** follows the previous frame through ordinary drag and mouse-wheel changes. It uses route anchors plus known nodes predicted to be in or near the current viewport.
2. **Wide reacquisition** runs only when local tracking loses the constellation, for example after a large drag, several zoom steps, or reopening the tree at a substantially different view. It searches the known nodes in the current tree scope and must meet a stronger inlier/confidence threshold before the HUD is allowed to lock again.

The solved transform is still intentionally simple:

`screen = tree * scale + offset`

PoE does not rotate the passive tree during normal interaction, so no arbitrary rotation is introduced.

## Zoom behavior

Exile-UI's PoE 1 schematic value `clientHeight / 10000` remains useful as an initial scale seed, but it is **not** the operating constraint anymore.

The live tracker replaces that seed with the observed tree scale. Players may then zoom in and out normally and the target marker should follow.

The marker size also scales within bounded limits so it remains readable without becoming enormous at high zoom.

## Pan behavior

Dragging the passive tree changes translation. The local tracker solves that translation continuously from visible PoB/GGG node geometry.

If the target leaves the screen, ExileQuesting keeps the solved tree transform and renders an edge arrow toward the target. Panning back toward the target should bring the node marker back without calibration.

## One-time screen reference / recovery anchor

The current v0.2.5 candidate still keeps a conservative one-time reference flow so tree-open detection is based on the player's actual client rather than generic gameplay circle detection.

To establish the reference for a base tree:

1. Run Path of Exile in Borderless / Windowed Fullscreen.
2. Open the passive tree.
3. Hover the character's large class-start circle.
4. Press `Ctrl+Shift+C` once.

The tree does **not** need to remain fully zoomed out afterward. The full-zoom scale is only a seed if no better live scale is available.

For an Ascendancy tree, use the same recovery hotkey while hovering that Ascendancy's root/start circle.

`Ctrl+Shift+C` is a setup/recovery action, not a normal navigation requirement. Ordinary panning and zooming must not require it.

### Recovery/debug hotkeys

- `Ctrl+Shift+C`: refresh the screen reference / anchor when automatic recovery cannot establish a trustworthy transform.
- `Ctrl+Shift+Up`: diagnostic scale nudge +1%.
- `Ctrl+Shift+Down`: diagnostic scale nudge -1%.
- `Ctrl+Shift+0`: clear the current stored reference.

The scale keys are diagnostics, not expected gameplay controls.

## Performance contract

When no supported build/passive guidance is available, capture work is skipped.

When waiting for the passive tree, ExileQuesting only performs the low-frequency static screen check.

When the passive tree is positively visible, a small Path of Exile thumbnail is used for node tracking. Candidate detection is restricted to this confirmed-tree state. Local tracking is preferred; the wider reacquisition path runs only after the cheap tracker fails.

Renderer state is fingerprinted so unchanged HUD state is not repeatedly sent to the renderer.

## Capture/recording contract

ExileQuesting windows must remain recordable by normal capture software such as OBS, Discord and Xbox Game Bar.

The old Passive Tree HUD enabled Electron `setContentProtection(true)`, which can map to Windows capture exclusion behavior. The v0.2.5 release candidate applies the capture-safe policy so ExileQuesting does not intentionally exclude its windows from normal recording.

The HUD remains transparent, always-on-top and click-through.

## Supported tree scopes

### Base passive tree

All seven base classes use PoB-validated GGG geometry and canonical class starts. No class-specific screen-coordinate table is used.

### Ascendancy trees

Ascendancy nodes use their fixed local geometry with PoB-compatible interpretation and their own root/start scope. Base-tree and Ascendancy coordinates are not mixed into one transform.

## Build-source semantics

### Maxroll

Ordered passive history can supply an exact allocate/refund operation, so ExileQuesting can render the exact next fixed node plus nearby route context.

### Path of Building

PoB stages are allocation sets, not a trustworthy click-by-click order. ExileQuesting highlights supported stage nodes without inventing a source-authored exact order.

PoB remains the geometry/layout authority even when ordered next-node guidance originates from Maxroll.

## Passive-point availability

`waiting-point` is distinct from `waiting-tree`.

A current trusted `/passives` snapshot can prove zero unspent points. Very early exact routes can also prove no level-earned point is available yet. Unknown is not treated as zero.

ExileQuesting does not add process-memory reads simply to obtain a permanent live point counter.

## Fail-closed behavior

The HUD stays hidden when:

- the passive-tree screen signature does not match;
- the active target has no fixed PoB-compatible geometry;
- a trusted zero-point state exists;
- Path of Exile is not running or cannot be captured;
- the PoE window moves to an unreferenced display/window shape;
- the live node constellation cannot currently be solved with sufficient confidence.

If local tracking is lost while the tree remains open, the service attempts wider automatic reacquisition before asking for manual recovery.

A hidden HUD is still preferred to a plausible-looking marker on the wrong node.

## Safety boundary

Passive Tree HUD is observation + visualization only. It uses public GGG passive data, PoB-compatible geometry, existing build guidance, visible game-window capture and a transparent click-through Electron window.

It does not read Path of Exile process memory, inject code, synthesize gameplay input, move the cursor, or allocate/refund passives. ExileQuesting does not claim official endorsement by Grinding Gear Games.

## v0.2.5 validation checklist

Before publishing v0.2.5:

- typecheck and unit tests pass;
- PoB passive-layout validation passes;
- deterministic tree-screen-check tests pass;
- synthetic tracker tests cover ordinary pan, zoom, aggressive pan+zoom and wide reacquisition;
- production build passes;
- packaged Windows app starts successfully;
- opening PoE without opening the passive tree leaves the HUD hidden;
- opening the passive tree shows the node HUD only after positive screen confirmation;
- the next node follows repeated zoom-in/zoom-out operations;
- the next node follows dragging/panning in every direction;
- an offscreen next node produces a useful edge indicator and returns to the node when panned back onscreen;
- closing the tree hides the HUD and reopening it automatically re-locks without normal-use recalibration;
- multiple route nodes align, not only the class-start anchor;
- DPI/resolution/display changes fail closed or select the correct reference instead of silently reusing a wrong transform;
- OBS/Game Bar/Discord capture remain functional with ExileQuesting running;
- unfinished Build Doctor functionality is not included in the v0.2.5 release branch.
