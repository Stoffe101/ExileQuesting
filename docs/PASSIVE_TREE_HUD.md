# Passive Tree HUD

Passive Tree HUD is ExileQuesting's visual bridge between an exact build-guide passive operation and Path of Exile's enormous in-game passive tree.

The player-facing goal is deliberately simple:

> Open the passive tree and immediately see the exact node ExileQuesting wants you to allocate or refund, even after panning, zooming, changing resolution, moving the game to another monitor, or using an ultrawide display.

The HUD is guidance only. It never moves the cursor, clicks a node, injects into the game, reads process memory, allocates a passive, or generates game input.

## Why this is not a pixel map

A fixed table such as `Finesse = x 1214, y 642 at 1920x1080` is not viable. Path of Exile's passive tree is a camera over a much larger tree coordinate system. Zoom, pan, window size, DPI and monitor layout all change where a node appears on screen.

Passive Tree HUD therefore uses two coordinate spaces:

1. **Tree space**: stable coordinates derived from Grinding Gear Games' passive-tree data.
2. **Screen space**: the current captured display in device-independent screen coordinates.

The runtime solves a positive uniform scale plus translation between those spaces:

`screen = tree * scale + offset`

Path of Exile does not rotate the passive tree, so no rotation term should be required. A transform is accepted only after multiple visible tree anchors agree with it.

## Research

### Exile-UI

Lailloken/Exile-UI can import a Path of Building passive tree and overlay a schematic over Path of Exile. Its documented skill-tree overlay depends on image-check calibration and currently expects the in-game tree to be fully zoomed out. Older documentation also describes manually aligning the imported overlay with the in-game tree.

Useful lesson: direct in-game overlay is valuable. Limitation to avoid: one manually aligned camera state.

### XileHUD / poe_overlay

XileHUD includes a dedicated passive-tree BrowserWindow with an SVG tree, pan/zoom, search and progression controls. It demonstrates that a readable interactive tree viewer works well in Electron, but it is its own viewport rather than a registration layer attached to Path of Exile's current tree camera.

Useful lesson: keep progression state, viewport state and rendering separate. Limitation to avoid: asking the player to use a second tree when the real game tree is already open.

### Exile Build PoE

Exile Build PoE also provides an interactive passive-tree canvas with zoom/pan and allocated-node rendering. It reinforces the value of rendering from GGG's native tree geometry rather than hand-authored node positions.

### Path of Building

Path of Building derives node positions from the GGG group/orbit representation. ExileQuesting follows the same geometry rather than copying PoB rendering code:

- group provides a stable centre `(x, y)`;
- node provides `orbit` and `orbitIndex`;
- GGG provides `skillsPerOrbit` and `orbitRadii`;
- standard orbits are evenly spaced;
- 16-slot and 40-slot orbits use the same non-uniform angle sets used by the official/PoB tree representation.

This produces stable Cartesian tree coordinates for each passive ID.

## Current PoE 3.29 source contract

ExileQuesting's generator reads the public Path of Exile passive-tree page and extracts `passiveSkillTreeData`.

The researched 3.29 response exposes:

- 3,390 raw nodes;
- 797 groups;
- global min/max tree bounds;
- class-start nodes;
- node group/orbit/orbit-index data;
- outgoing graph connections;
- `skillsPerOrbit`;
- orbit radii `[0, 82, 162, 335, 493, 662, 846]`.

The Ranger class-start node in that snapshot is ID `50459`, class-start index `2`.

The bundled ExileQuesting passive snapshot is upgraded from identity-only schema v1 to geometry-capable schema v2. Runtime validation remains backward compatible with v1 data, but Passive Tree HUD refuses to place markers unless valid v2 geometry is present.

## Registration architecture

### Capture

On Windows the service uses Electron's `desktopCapturer` screen sources. `DesktopCapturerSource.display_id` maps to Electron's `Display.id`, which lets the capture be associated with the correct monitor.

The display nearest the cursor is the preferred capture source while the tree is being acquired. This naturally follows the monitor where the player is currently interacting with the passive tree.

Captures are deliberately downscaled for registration. HUD coordinates are then converted back to the display's full device-independent bounds.

### Self-capture prevention

The transparent Passive Tree HUD BrowserWindow uses `setContentProtection(true)` on Windows. Electron implements this with `WDA_EXCLUDEFROMCAPTURE` on supported Windows versions, preventing the HUD from contaminating its own screen capture.

The HUD is also click-through via `setIgnoreMouseEvents(true, { forward: true })`. The player continues interacting with Path of Exile normally underneath it.

### Candidate detection

The detector does not need to understand every texture in the passive tree. It searches for repeated radial node geometry at multiple plausible radii in a downscaled luminance image.

Candidate points are scored using radial contrast/coverage and non-maximum suppression. The output is a bounded set of likely visible node centres.

### Transform fitting

The expected anchor set is build-specific rather than all 3,000+ nodes. It is assembled from:

- recently completed Maxroll passive operations;
- the exact next operation;
- nearby graph neighbours;
- the class start at early progression;
- a small number of spatially separated path nodes for registration stability.

A bounded pair-based similarity/RANSAC search proposes scale + translation transforms. Each proposal is scored by projecting expected anchors into the capture and measuring how many land close to detected node centres.

The best transform is refined from its matches. It is rejected unless it satisfies minimum inlier count, scale range, residual and spatial-coverage thresholds.

### Tracking and hysteresis

There are two operating speeds:

- **searching**: low-frequency captures while no passive tree is confidently registered;
- **locked**: higher-frequency updates while a valid tree transform exists.

A single weak frame does not instantly remove a marker. Likewise, one lucky false match does not instantly display one. Lock/unlock hysteresis and a stale-transform deadline keep the HUD stable without allowing old coordinates to linger indefinitely.

## HUD rendering

When confidence is high and the exact guide operation has geometry, the full-screen transparent window can render:

- a pulsing ring on the exact next node;
- node name and kind;
- `ALLOCATE` or `REFUND`;
- Maxroll operation index / total;
- a subtle path preview from recent/nearby operations;
- an edge arrow when the target is outside the visible passive-tree viewport;
- a small confidence/debug surface only when diagnostics are explicitly enabled.

The normal campaign overlay remains a separate window.

## Resolution and DPI

The HUD must not contain special coordinate tables for 1920×1080, 2560×1440 or 3440×1440.

The detector works in capture pixels, the solved transform is normalized against the actual capture dimensions, and rendering is mapped into the selected Electron `Display.bounds`. This is tested synthetically across common 16:9 and ultrawide sizes and multiple zoom/pan transforms.

Mixed-DPI monitors require explicit conversion between thumbnail/capture pixels and Electron display DIPs. The display scale factor is diagnostic information, not a hard-coded multiplier.

## Safety boundary

Passive Tree HUD is intentionally observation + visualization:

Allowed by ExileQuesting's product design:

- reading the public passive-tree dataset;
- reading the user-selected Client.txt log;
- capturing visible screen pixels to align a visible marker;
- drawing a transparent click-through overlay;
- telling the player which passive to choose.

Not implemented:

- process-memory reading;
- DLL injection;
- cursor movement;
- simulated clicks/keypresses;
- passive allocation;
- automatically playing any part of Path of Exile.

Grinding Gear Games does not provide a blanket approval mechanism for arbitrary third-party tools, so ExileQuesting should never advertise this feature as officially approved. The implementation stays on the same advisory-only boundary as the rest of the application.

## Failure behaviour

Incorrect passive guidance is worse than no marker.

The HUD therefore hides and reports a reason when:

- no active Maxroll exact passive exists;
- the guide's passive IDs are stale/incompatible;
- bundled tree geometry is missing/corrupt;
- the passive tree is not visible;
- registration confidence is too low;
- the target node lacks geometry;
- capture is unavailable, such as some exclusive-fullscreen configurations.

The existing textual `NEXT PASSIVE` guidance remains available as the fallback.

## Validation plan

Permanent automated coverage should include:

- official tree geometry snapshot validation;
- orbit-position regression tests;
- graph-neighbour/path anchor selection;
- transform solve/reprojection tests;
- synthetic 1920×1080, 2560×1440, 3440×1440 and 3840×2160 scenes;
- multiple simulated zoom levels and pans;
- false-positive/no-tree rejection;
- offscreen-arrow geometry;
- capture-to-display coordinate conversion;
- transparent HUD visual smoke at 100%, 125% and 150% scale factors;
- packaged Windows lifecycle/soak coverage.

Synthetic validation proves the math. A real Path of Exile playtest is still required to tune node-candidate thresholds against GGG's actual rendered tree at different UI settings, resolutions and zoom levels before this feature should be released as fully automatic.
