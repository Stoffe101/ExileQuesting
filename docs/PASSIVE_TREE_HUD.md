# Passive Tree HUD

Passive Tree HUD is ExileQuesting's visual bridge between build guidance and Path of Exile's in-game passive tree.

The player-facing goal is deliberately simple: open the passive tree and immediately see the passive decision ExileQuesting can prove from the active build source, even after panning, zooming, changing resolution, moving the game to another monitor, or using an ultrawide display.

The HUD is guidance only. It never moves the cursor, clicks a node, injects into the game, reads process memory, allocates a passive, or generates game input.

## All seven base classes

Passive Tree HUD is not built around Ranger coordinates or a class-specific template. The current GGG passive-tree response exposes a `classes` table and a `classStartIndex` on each class-start node. ExileQuesting joins those two pieces of official data when generating the bundled snapshot.

The runtime therefore supports the seven base classes through the same code path:

- Scion
- Marauder
- Ranger
- Witch
- Duelist
- Templar
- Shadow

No base-class start node ID is hard-coded into registration logic. A snapshot is rejected if it does not contain exactly seven unique, positioned class starts with the canonical GGG class names.

This matters because the raw GGG node labels cannot safely be used as class names. In the researched 3.29 response, two raw class-start labels are `Seven` and `SIX`; the corresponding canonical names are Scion and Shadow in `tree.classes`. The generator deliberately uses `classStartIndex` rather than trying to infer those names.

Build imports can identify a class by friendly base-class name or by the GGG/PoB class index. Maxroll attribute-style identifiers and ascendancy aliases are normalized back to the appropriate base class before a class-start anchor is selected.

## Build-source semantics

The HUD never claims more precision than the source actually contains.

### Maxroll

A Maxroll planner with ordered passive history provides explicit allocate/refund operations. ExileQuesting can therefore show one exact next passive operation, backed by the current passive node ID and current bundled node name.

The Maxroll passive cursor is independent from character level. Level changes can advance level-labelled skill/gem milestones, but they do not imply how many passive points the player has actually allocated. The player acknowledges passive operations explicitly in Build Coach.

### Path of Building

PoB tree stages contain sets of allocated nodes, not a reliable click-by-click allocation history. For the active tree stage, ExileQuesting compares it with the previous tree stage and highlights the nodes newly introduced by that stage.

It intentionally does not turn that set into a fake allocation order.

### Unsupported or stale targets

If the active build has no usable passive stage, a Maxroll planner is stale, or a target cannot be mapped to proven fixed geometry, Passive Tree HUD stays hidden and the existing textual Build Coach guidance remains available.

Incorrect passive guidance is worse than no visual marker.

## Why this is not a pixel map

A fixed table such as `Finesse = x 1214, y 642 at 1920x1080` is not viable. Path of Exile's passive tree is a camera over a much larger tree coordinate system. Zoom, pan, window size, DPI and monitor layout all change where a node appears on screen.

Passive Tree HUD therefore uses two coordinate spaces:

1. **Tree space**: stable coordinates derived from Grinding Gear Games' passive-tree data.
2. **Screen space**: the current captured display in device-independent screen coordinates.

The runtime solves a positive uniform scale plus translation between those spaces:

`screen = tree * scale + offset`

Path of Exile does not normally rotate the passive tree, so no rotation term is used. A transform is accepted only after multiple visible tree anchors agree with it.

## Research lineage

### Exile-UI

Lailloken/Exile-UI demonstrates the usefulness of showing imported passive-tree guidance in-game. Its documented skill-tree overlay relies on image-check calibration and a constrained tree camera state. ExileQuesting keeps the useful in-game guidance idea but avoids a fixed/manual camera assumption.

### XileHUD / poe_overlay

XileHUD includes a dedicated passive-tree BrowserWindow with an SVG tree, pan/zoom, search and progression controls. It reinforces the value of keeping progression state, viewport state and rendering separate. Passive Tree HUD instead registers against the game's existing tree viewport so the player does not have to operate a second tree.

### Path of Building

Path of Building derives normal passive node positions from GGG's group/orbit representation. ExileQuesting follows the same underlying geometry model rather than copying PoB's renderer:

- group provides a stable centre `(x, y)`;
- node provides `orbit` and `orbitIndex`;
- GGG provides `skillsPerOrbit` and `orbitRadii`;
- standard orbits are evenly spaced;
- 16-slot and 40-slot orbits use their published non-uniform angle sets.

This produces stable Cartesian tree coordinates for fixed base-tree passive IDs.

PoB also provides an important warning for Ascendancy data: its current `fix_ascendancy_positions.py` explicitly normalizes Ascendancy groups because the positions supplied by GGG appear scrambled. ExileQuesting therefore does not treat raw Ascendancy coordinates as trustworthy base-tree coordinates.

## Current PoE 3.29 source contract

The generator reads the public Path of Exile passive-tree page and extracts `passiveSkillTreeData`.

The current generated schema-v2 snapshot contains:

- 3,389 named passive definitions;
- 2,429 positioned static main-tree nodes;
- 402 explicitly dynamic definitions without a fixed base-tree position;
- all seven canonical class starts;
- graph connections;
- global tree bounds;
- `skillsPerOrbit` and orbit radii.

Dynamic definitions include data such as Cluster Jewel notables and mastery-effect definitions that do not represent one fixed position on the ordinary passive tree. They are retained for identity/intelligence purposes but never assigned an invented HUD coordinate.

Runtime validation remains backward-compatible with identity-only schema-v1 data for textual features, but Passive Tree HUD refuses to place markers without a valid geometry-capable schema-v2 snapshot.

## Ascendancy behavior

Base-class support and Ascendancy-tree rendering are deliberately treated as different problems.

The current 3.29 GGG data exposes Ascendancy nodes, but the raw group placement is not trustworthy enough to reuse directly for a live screen marker. Path of Building maintains a separate normalization table for these groups, which confirms that the raw layout needs special treatment.

For this release:

- base-tree passive guidance supports all seven classes through data-driven starts;
- Ascendancy operations may still be identified textually by the build system;
- visual Passive Tree HUD placement for an Ascendancy target fails closed unless a trustworthy dedicated Ascendancy geometry model is available;
- ExileQuesting never projects a raw/guessed Ascendancy position onto the player's screen.

A later dedicated Ascendancy viewport model can be added without weakening the correctness guarantees of the base-tree HUD.

## Registration architecture

### Capture

On Windows the service uses Electron's `desktopCapturer` screen sources. `DesktopCapturerSource.display_id` is matched against Electron `Display.id`, allowing the capture to be associated with the correct monitor.

The display nearest the cursor is preferred while acquiring the passive tree. After a confident lock, that display remains the first tracking target.

Captures are deliberately downscaled for registration. Projected HUD coordinates are converted back to the full Electron display bounds.

### Self-capture prevention

The transparent Passive Tree HUD BrowserWindow uses `setContentProtection(true)` on Windows. Electron maps this to the supported Windows capture-exclusion mechanism, preventing the HUD from feeding its own marker back into registration.

The window is also click-through via `setIgnoreMouseEvents(true, { forward: true })`. The player continues interacting with Path of Exile underneath it.

### Candidate detection

The detector searches the downscaled luminance image for repeated radial node geometry at several plausible radii. Candidates are scored using radial contrast/coverage and bounded non-maximum suppression.

The detector does not need to OCR passive names or understand every passive-tree texture.

### Build-aware anchor selection

Registration does not blindly compare against all 3,000+ passive definitions. The expected anchor constellation is assembled from the active build:

- recent and upcoming ordered Maxroll operations;
- the exact next Maxroll target;
- PoB stage targets when the source is unordered;
- nearby graph neighbours;
- the correct data-driven class start where useful;
- spatially separated path nodes for registration stability.

The class-start helper explicitly avoids mixing starts from other classes.

### Transform fitting

A bounded pair-based similarity/RANSAC-style search proposes scale + translation transforms. Each proposal is scored by projecting expected tree anchors into the capture and measuring how many land close to detected node centres.

The best transform is refined from its matches. It is rejected unless it satisfies minimum inlier, scale, residual and confidence thresholds.

### Tracking

The service uses a slower search cadence while no tree is registered and a faster cadence while locked. Weak/ambiguous frames hide the HUD rather than allowing stale coordinates to persist indefinitely.

## HUD rendering

For ordered Maxroll progression, a locked HUD can render:

- a high-visibility ring on the exact next node;
- `NEXT PASSIVE` or `REFUND PASSIVE`;
- node name and kind;
- operation index / total;
- a subtle recent/upcoming path preview;
- an edge indicator when the target is outside the current viewport.

For PoB stage progression, the HUD renders the newly-added stage nodes together with a clear `POB STAGE` legend and does not render an exact-target ring.

The normal campaign overlay remains a separate window.

## Resolution, ultrawide and DPI

There are no coordinate tables for 1920×1080, 2560×1440, 3440×1440 or 3840×2160.

The detector works in capture pixels, the solved transform is normalized against the actual capture dimensions, and rendering is mapped into the selected Electron display bounds. Synthetic transform tests cover multiple pan/zoom states and common 16:9/ultrawide resolutions.

A permanent Passive Tree HUD visual-smoke harness renders exact allocate, exact refund, PoB-stage and off-screen states at:

- 1920×1080
- 2560×1440
- 3440×1440
- 3840×2160

The Windows gate executes that matrix at 100%, 125% and 150% forced device scale factors and rejects overflow or missing state-specific UI.

## Safety boundary

Passive Tree HUD is observation + visualization only.

Implemented:

- reading the public passive-tree dataset;
- reading the user-selected Client.txt log through the existing app pipeline;
- capturing visible screen pixels to align a visible marker;
- drawing a transparent click-through overlay;
- telling the player which passive decision the imported build source supports.

Not implemented:

- process-memory reading;
- DLL injection;
- cursor movement;
- simulated clicks or keypresses;
- passive allocation/refunding;
- automatic gameplay.

Grinding Gear Games does not provide blanket approval for arbitrary third-party tools, so ExileQuesting should not advertise the feature as officially approved or endorsed.

## Fail-closed behavior

The HUD hides and reports a reason when:

- no active supported passive guidance exists;
- Maxroll passive IDs are stale/incompatible;
- bundled tree geometry is missing/corrupt;
- the passive tree is not visible enough to register;
- registration confidence is too low;
- a target is dynamic or otherwise lacks proven fixed geometry;
- the target is an Ascendancy node without a dedicated trusted layout;
- desktop capture is unavailable or cannot be mapped unambiguously to a display.

Textual Build Coach guidance remains the fallback.

## Validation

Permanent automated coverage now includes:

- schema-v1 compatibility and strict schema-v2 geometry validation;
- all seven canonical base-class starts;
- per-class registration-anchor selection;
- orbit-position regression behavior;
- graph-neighbour/path anchor selection;
- scale/translation solve and reprojection tests;
- 1920×1080, 2560×1440, 3440×1440 and 3840×2160 synthetic scenes;
- multiple simulated zoom levels and pans;
- false-positive/no-tree rejection;
- off-screen indicator geometry;
- capture/display coordinate conversion;
- Maxroll exact allocate/refund semantics;
- PoB unordered-stage semantics;
- Windows HUD visual smoke at 100%, 125% and 150% scale factors;
- the repository's existing packaged Windows installer/updater/uninstaller gates.

The remaining validation that automation cannot manufacture is a real Path of Exile playtest. Synthetic registration proves the coordinate math and rejection behavior; actual game pixels are still needed to tune detector thresholds against GGG's real rendered passive tree, UI settings, zoom levels and mixed-DPI setups before describing the visual detector as fully calibrated in-game.
