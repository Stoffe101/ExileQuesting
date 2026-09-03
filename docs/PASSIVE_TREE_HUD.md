# Passive Tree HUD

Passive Tree HUD is ExileQuesting's visual bridge between imported build guidance and Path of Exile's in-game passive tree.

The v0.2.5 implementation intentionally favors a small, deterministic system over computer-vision-heavy automatic registration. The HUD never moves the cursor, clicks nodes, reads process memory, injects into Path of Exile, or allocates/refunds a passive.

## v0.2.5 behavior

The HUD is hidden unless all of the following are true:

- Passive Tree HUD is enabled.
- An active build supplies supported passive guidance.
- ExileQuesting does not have trusted evidence that zero passive points are available.
- Path of Exile is running.
- The current client/display matches a stored calibration.
- The small, calibrated passive-tree UI check positively matches twice in succession.

Merely launching Path of Exile must never make the HUD visible.

## Why the old registration was removed

The v0.2.4 runtime attempted to recognize many circular/radial node candidates across a Path of Exile capture and solve a point-cloud transform from them. That created three practical problems:

1. ordinary gameplay/UI circles could be mistaken for a passive tree;
2. repeated candidate detection and registration added unnecessary capture/CPU work;
3. a guessed transform could be confidently wrong, producing severe node misalignment.

v0.2.5 removes that runtime path. There is no global radial-node scan and no point-cloud registration loop in `PassiveTreeHudService`.

## Tree-open detection

ExileQuesting now follows the proven Exile-UI pattern: inspect a tiny, client-relative static UI region near the top-center of the PoE 1 passive-tree screen.

For PoE 1 the normalized reference region is:

- x: centered horizontally;
- y: `0.054 * clientHeight`;
- width: `clientHeight / 16`;
- height: `0.02 * clientHeight`.

A one-time calibration stores a small grayscale signature from that region. Runtime polling only compares the same tiny sample grid. Two consecutive matches are required before the transparent HUD window is shown. Any mismatch hides the HUD.

This screen check answers only one question: "is the calibrated passive-tree UI actually visible?" It does not derive node coordinates.

## Node projection

Node coordinates come from the bundled GGG passive-tree snapshot. The generator already converts GGG group/orbit/orbit-index data into fixed tree-space x/y coordinates using the same orbit geometry used by other PoE tooling.

At the fully zoomed-out PoE 1 tree, Exile-UI's current schematic uses:

`scale = clientHeight / 10000`

v0.2.5 uses the equivalent scale in the Electron overlay's display-independent coordinate space. Translation is calibrated from the real class-start or Ascendancy-start circle under the player's cursor.

The resulting projection is simply:

`screen = tree * scale + offset`

There is no rotation and no guessed registration cloud.

## One-time calibration

For v0.2.5, precise visual guidance intentionally targets **Borderless / Windowed Fullscreen** Path of Exile clients. Arbitrary offset bordered-window mode fails closed instead of mapping client coordinates to the whole monitor.

To calibrate a base tree:

1. Set Path of Exile to Borderless / Windowed Fullscreen.
2. Open the passive tree.
3. Fully zoom the passive tree out.
4. Put the mouse on the character's class-start circle.
5. Press `Ctrl+Shift+C`.

For an Ascendancy tree, use the same hotkey while hovering that Ascendancy's start/root circle.

Calibration is stored per display, DPI/scale configuration and tree scope. It includes the translation, full-zoom scale, capture aspect and the passive-tree UI signature.

If the in-game tree is moved after calibration, hover the start circle and press `Ctrl+Shift+C` again to re-anchor it. This mirrors the practical re-alignment model used by Exile-UI after the in-game tree position resets.

### Calibration hotkeys

- `Ctrl+Shift+C`: recalibrate/recenter at the class or Ascendancy start under the cursor.
- `Ctrl+Shift+Up`: increase projection scale by 1% around the calibrated anchor.
- `Ctrl+Shift+Down`: decrease projection scale by 1% around the calibrated anchor.
- `Ctrl+Shift+0`: clear the current calibration.

The scale adjustment keys are a diagnostic/fine-tuning escape hatch. The expected normal scale is derived from the full-zoom client height.

## Performance contract

When no supported build/passive point is available, capture work is skipped entirely.

When waiting for the tree, the service requests only a small Path of Exile window thumbnail at low frequency. When the tree is visible, it continues the same tiny UI check so the HUD can disappear quickly when the tree closes. It does not run node detection or transform registration every frame.

Renderer state is fingerprinted so unchanged HUD state is not repeatedly sent to the renderer.

## Capture/recording contract

ExileQuesting windows must be recordable by normal capture software such as OBS, Discord and Xbox Game Bar.

The old Passive Tree HUD enabled Electron `setContentProtection(true)`, which can map to Windows display-affinity/capture exclusion behavior. v0.2.5 installs a capture-safe window policy before the legacy window bootstrap and immediately clears content protection on created ExileQuesting windows.

The HUD remains transparent, always-on-top and click-through, but it is not protected media and must not exclude itself or interfere with game/video capture.

## Supported tree scopes

### Base passive tree

All seven base classes use GGG-derived class starts and fixed node geometry. No class-specific screen-coordinate table is used.

### Ascendancy trees

Ascendancy nodes use their fixed local GGG geometry and their own root/start anchor. Base-tree and Ascendancy coordinates are never mixed into one projection.

## Build-source semantics

### Maxroll

Ordered passive history can supply an exact allocate/refund operation, so ExileQuesting can render the exact next fixed node plus nearby route context.

### Path of Building

PoB stages are allocation sets, not a trustworthy click-by-click order. ExileQuesting therefore highlights the supported stage nodes without inventing a source-authored exact order.

## Passive-point availability

`waiting-point` is distinct from `waiting-tree`.

A current trusted `/passives` snapshot can prove zero unspent points. Very early exact routes can also prove no level-earned point is available yet. In those cases the HUD stays hidden and does not perform window capture work.

Unknown is not treated as zero. ExileQuesting does not add process-memory reads simply to obtain a permanent live point counter.

## Fail-closed behavior

The HUD remains hidden when:

- the tree signature does not match;
- calibration is missing or malformed;
- the PoE client/display aspect no longer matches calibration;
- the active target has no fixed geometry;
- a trusted zero-point state exists;
- the manager is focused;
- Path of Exile is not running or cannot be captured;
- the selected mode is outside the v0.2.5 precise-mapping contract.

A hidden HUD is preferred to a plausible-looking marker on the wrong node.

## Safety boundary

Passive Tree HUD is observation + visualization only. It uses public GGG passive data, existing build guidance, visible game-window capture and a transparent click-through Electron window.

It does not read Path of Exile process memory, inject code, synthesize gameplay input, move the cursor, or allocate/refund passives. ExileQuesting does not claim official endorsement by Grinding Gear Games.

## v0.2.5 validation checklist

Before publishing v0.2.5:

- typecheck and unit tests pass;
- deterministic tree-screen-check tests pass;
- production build passes;
- packaged Windows app starts successfully;
- opening PoE without opening the passive tree leaves the HUD hidden;
- opening the calibrated fully zoomed-out passive tree shows the HUD only after positive confirmation;
- closing the tree hides the HUD;
- class-start calibration aligns multiple known route nodes, not only the anchor;
- DPI/resolution changes invalidate or select the correct calibration instead of silently reusing the wrong one;
- OBS/Game Bar/Discord capture remain functional with ExileQuesting running;
- unfinished Build Doctor functionality is not included in the v0.2.5 release branch.
