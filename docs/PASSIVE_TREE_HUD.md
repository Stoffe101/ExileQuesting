# Passive Target Lock

Passive Target Lock is ExileQuesting's visual bridge between ordered build guidance and Path of Exile's in-game passive tree.

The feature does not render a second passive tree. It renders one clear crosshair directly over the exact next fixed passive node chosen by the active build route.

It never moves the cursor, clicks nodes, reads process memory, injects into Path of Exile, or allocates/refunds a passive.

## Product requirement

The build route is the only authority allowed to choose the target node.

For an exact guide, ExileQuesting holds a permanent logical identity such as:

`targetNodeId = 57264 // Spell Damage and Mana`

Vision is not allowed to replace that ID with another passive circle. Vision is used only to determine how the already-known passive-tree canvas moved on screen.

The visual contract is:

- pan left: the target node and crosshair move left together;
- pan right: they move right together;
- zoom in/out: the crosshair remains centred on the same node ID;
- stationary tree: the crosshair is stationary;
- build advances: the crosshair intentionally moves to the new build-authored node ID;
- offscreen target: an edge indicator points toward the projected target;
- uncertain tracking: hide the crosshair rather than jump to another plausible node.

A marker bouncing around a stationary passive tree is a release-blocking failure.

## Source-of-truth hierarchy

1. Grinding Gear Games supplies raw passive-tree data.
2. Path of Building Community is the canonical geometry/layout interpretation used to validate class starts, groups/orbits and fixed node positions.
3. The active ordered guide selects which node ID is next.
4. Visible PoE window frames provide only passive-tree camera motion.

Canonical base class starts remain:

- Scion `58833`
- Marauder `47175`
- Ranger `50459`
- Witch `54447`
- Duelist `50986`
- Templar `61525`
- Shadow `44683`

The permanent Witch regression remains:

`54447 Witch start -> 57264 Spell Damage and Mana`

## Tree-open detection

ExileQuesting keeps the lightweight static top-centre PoE 1 passive-tree screen signature.

The screen check answers only:

**Is the passive skill tree actually visible?**

Two consecutive positive matches are required before the target overlay can appear. Ordinary gameplay, flask circles and skill icons are never allowed to activate Passive Target Lock.

## Target identity

For an exact route, the target is a fixed GGG/PoB node ID and fixed tree-space coordinate.

The target ID cannot be changed by image matching, frame tracking or confidence scoring. Only build progression can advance it.

This removes the failed v0.2.5 experiment where a dense cloud of visually interchangeable passive circles was repeatedly matched against many possible PoB nodes.

The deleted constellation tracker is not part of the runtime anymore.

## Camera tracking

The passive tree uses a simple camera model for this feature:

`screen = tree * scale + offset`

Normal passive-tree interaction changes uniform scale and X/Y translation. Path of Exile does not rotate the tree during ordinary use.

After the initial trusted anchor, ExileQuesting compares consecutive already-confirmed passive-tree captures. It selects textured image patches across the moving tree canvas and robustly fits only:

- uniform scale;
- X translation;
- Y translation.

These image features have no passive-node identity. They cannot decide that node `57264` became another circle.

Zoom is modeled explicitly around the passive-tree viewport centre before residual pan is solved. This is important for aggressive mouse-wheel changes because a large centre zoom otherwise looks like an enormous translation when expressed around the capture origin.

The resulting frame motion is composed onto the trusted PoB tree-to-screen transform, so every fixed node coordinate remains available while only the viewport moves.

## Fail-closed tracking

A bad motion estimate is rejected when it lacks enough consistent image matches, has excessive residual error, contains rotation-like/incoherent motion, or falls outside bounded per-frame scale limits.

For each confirmed frame ExileQuesting first tries the normal tracker. If that exact frame cannot be solved confidently, a wider scale/pan hypothesis search is attempted immediately against the same previous trusted frame and current capture.

If both attempts fail:

1. the target crosshair is hidden;
2. the previous trusted tree frame and transform are retained;
3. the failed capture is not promoted to a trusted reference;
4. repeated failures eventually ask for a fresh anchor.

There is no fallback to global anonymous passive-circle registration.

A temporarily hidden target is always preferred to a confident marker on the wrong node.

## One-time anchor

The v0.2.5 target-lock candidate uses one deterministic setup/recovery anchor per display/tree scope.

For the base passive tree:

1. use Borderless / Windowed Fullscreen;
2. open the passive tree;
3. fully zoom out once;
4. put the cursor in the centre of the character's large class-start node;
5. press `Ctrl+Shift+C` once.

For an Ascendancy tree, use the same flow with the Ascendancy root/start node.

The cursor coordinate and display are frozen immediately when the hotkey is pressed. The later reference-frame sampling cannot silently move the anchor if the player moves the mouse while those frames are being captured.

The maximum-zoom-out requirement applies only when creating/recovering the anchor. After that, ordinary pan and mouse-wheel zoom are tracked automatically.

`Ctrl+Shift+0` clears the stored anchor.

The previous diagnostic `Ctrl+Shift+Up/Down` scale-nudge controls were removed with the constellation tracker.

## Persistent trusted keyframe

The stored target-lock reference contains:

- the class/Ascendancy anchor transform;
- the passive-tree screen signature;
- capture shape/aspect;
- a trusted PoE tree keyframe.

While tracking is healthy, ExileQuesting periodically persists a newer trusted transform/keyframe. This allows a reopened tree or later application session to recover from an actual PoE image rather than inventing a node correspondence.

Only a successfully tracked frame becomes the next trusted frame. Failed motion estimates do not move the reference forward.

## Crosshair design

The exact target uses a hollow gold reticle with:

- a high-contrast circular lock ring;
- four cardinal target ticks;
- a tiny hollow centre point so the passive node itself remains visible;
- a compositor-static presentation with no permanent animation;
- `TAKE THIS NODE`, node name, node ID and route progress in the label.

Refund operations use the same reticle language with a warmer orange treatment.

The marker radius is intentionally screen-readable rather than scaling dramatically with tree zoom. Its centre, not its decorative size, is what must remain glued to the node.

## Offscreen behavior

Because all fixed passive nodes remain in PoB tree-space, the active target can still be projected outside the visible display while the trusted viewport transform is maintained.

When outside the safe viewport, the ring is replaced by an edge direction indicator. When the node returns onscreen, the same node ID is rendered under the reticle again.

## Resolution and class support

There is no per-node pixel database and no per-resolution node table.

Every supported fixed node keeps one canonical tree coordinate. Resolution, DPI, monitor size, pan and zoom affect only the current viewport transform.

The same engine therefore applies to all seven base classes and fixed base-tree nodes. Ascendancy scopes use their own fixed local geometry and their own anchor/transform.

Dynamic cluster-jewel layouts remain a separate modelling problem and must not be treated as ordinary fixed base-tree coordinates.

## Build-source semantics and progression

Exact ordered guides can select one precise allocate/refund node, so Target Lock can display one exact crosshair.

For the current Maxroll integration, advancing from one ordered passive operation to the next is an explicit build-progression action (`Taken ✓` / `Refunded ✓`). ExileQuesting does not pretend it observed an in-game node allocation when no reliable allocation signal was available. After progression advances, the next ordered node ID becomes the new immutable target.

A PoB stage that only provides an allocation set does not by itself prove a safe click-by-click order. Target Lock fails closed for that stage rather than choosing an arbitrary member of the set. PoB remains the canonical geometry/layout reference either way.

## Passive-point availability

Target Lock shows the build's next exact passive whenever supported guidance is available. A known zero unspent-point count no longer suppresses the next-node target.

This makes the HUD a navigation aid for the next intended point, not merely a notification that a point is currently spendable.

## Performance

When no exact supported build target exists, frame tracking is skipped.

When the passive tree is closed, only the low-frequency tree-screen check runs.

When the passive tree is confirmed open, the service uses a small PoE thumbnail and a bounded set of image patches. It does not scan hundreds of passive nodes and does not run the deleted circle-constellation solver.

Renderer state is fingerprinted so unchanged HUD state is not repeatedly sent to the overlay.

## Capture/recording contract

ExileQuesting must remain recordable by OBS, Discord and Xbox Game Bar.

The target overlay remains transparent, always-on-top and click-through. The v0.2.5 release candidate continues to use the capture-safe window policy rather than intentionally excluding ExileQuesting windows from recording.

## v0.2.5 acceptance checklist

Before publication:

- typecheck and unit tests pass;
- PoB passive-layout validation passes;
- deterministic tree-screen-check tests pass;
- synthetic frame-motion tests cover identity, pan, tooltip occlusion, fail-closed unrelated imagery, ordinary zoom+pan, aggressive ~1.6x zoom-in and aggressive zoom-out;
- production build and Windows packaging pass;
- opening PoE without the passive tree keeps Target Lock hidden;
- one maximum-zoom-out class-start anchor places the correct first target;
- Witch regression places the reticle on node `57264 Spell Damage and Mana`;
- stationary passive tree produces a stationary crosshair;
- repeated pan in every direction keeps the crosshair glued to the same node;
- repeated zoom in/out, including fast wheel input, keeps the crosshair glued to the same node or fails closed without teleporting;
- offscreen target produces an edge direction and returns to the same node when visible;
- spending a point changes target only when build progression advances;
- closing/reopening the tree hides/reacquires without ordinary-use recalibration;
- low-confidence tracking hides instead of teleporting;
- 1920x1080, 2560x1440 and 3440x1440/DPI scenarios do not require node-specific pixel tables;
- OBS/Game Bar/Discord capture remain functional;
- unfinished Build Doctor functionality remains excluded from this v0.2.5 release branch.

Do not merge this validation branch into `main` until real-client Target Lock validation passes.
