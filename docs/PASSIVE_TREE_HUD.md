# Passive Target Lock

Passive Target Lock is ExileQuesting's visual bridge between build guidance and Path of Exile's in-game passive tree.

It does not render a second passive tree. It renders one clear reticle directly over the exact next fixed passive node chosen by the active build route.

It never moves the cursor, clicks nodes, reads process memory, injects into Path of Exile, or allocates/refunds a passive.

## Hard product invariant

The build plan is the only authority allowed to choose the target node ID.

For example:

`targetNodeId = 57264 // Spell Damage and Mana`

Image processing is never allowed to replace that ID with another passive circle. Vision only answers where the already-known tree coordinate appears on screen and whether the already-known target operation visibly completed.

The required behavior is:

- pan left/right: the reticle follows the same target node;
- zoom in/out: the reticle remains centred on the same node ID;
- stationary tree: the reticle is stationary;
- allocation/refund verified: build progression advances exactly once, then a new build-controlled node ID becomes authoritative;
- offscreen target: an edge indicator points toward that same projected target;
- uncertain tracking or reacquisition: hide the reticle rather than jump to another plausible node.

A marker moving around a stationary passive tree is a release-blocking failure.

## Source-of-truth hierarchy

1. Grinding Gear Games supplies raw passive-tree data.
2. Path of Building Community is the canonical geometry/layout interpretation used to validate class starts, groups/orbits and fixed node positions.
3. The active build route selects which fixed node ID is next.
4. PoE window frames provide viewport motion, local target-state evidence and bootstrap/recovery evidence only.

Canonical base class starts:

- Scion `58833`
- Marauder `47175`
- Ranger `50459`
- Witch `54447`
- Duelist `50986`
- Templar `61525`
- Shadow `44683`

Permanent regression:

`54447 Witch start -> 57264 Spell Damage and Mana`

## Exact guide semantics

### Maxroll

When Maxroll exposes an ordered passive operation list, that source order is authoritative. Target Lock follows allocate/refund operations one at a time.

### Path of Building stages

A normal PoB tree stage is an allocation snapshot rather than a click log. ExileQuesting may derive an exact click-valid order only when the stage is provably a pure connected expansion:

- every ID must exist in the trusted fixed passive snapshot;
- dynamic/cluster-style nodes are rejected;
- no previously allocated fixed node may disappear;
- all additions must belong to one independently rendered tree scope;
- every derived click must be adjacent to the already allocated set at that moment;
- disconnected additions are rejected;
- mixed base-tree/Ascendancy additions are rejected;
- refund/repath stages are rejected.

When several frontier allocations are equally legal, ExileQuesting chooses a deterministic legal route while explicitly treating the priority as derived, not as an order encoded by PoB.

If these conditions cannot be proven, Target Lock refuses to fabricate an exact next click.

## Tree-open detection

A lightweight static PoE 1 passive-tree UI signature answers only whether the passive skill tree is visible. It does not identify passive nodes.

Two consecutive positive matches are required before the reticle is shown. Ordinary gameplay, flask circles and skill icons cannot activate Target Lock.

## Automatic first-run bootstrap

Target Lock normally bootstraps itself without asking the player to calibrate.

The bootstrap path is deliberately separate from steady-state tracking:

1. the build provides the class/Ascendancy scope;
2. GGG/PoB provides the exact fixed class/root node and its local graph;
3. a high-resolution bootstrap-only detector finds radial candidates;
4. the known large root plus its exact local graph must produce a unique, high-confidence transform;
5. multiple bounded zoom hypotheses are tried, so the user does not need to be at maximum zoom-out;
6. scale and translation are refined from the local graph while the root correspondence remains mandatory;
7. a second high-resolution capture must independently agree with the first transform;
8. only then is a trusted low-cost reference created.

A noisy single frame, duplicate plausible root, insufficient graph coverage or unsupported scope fails closed.

The old anonymous whole-tree circle solver is not used here or during steady-state tracking.

### Emergency manual reference

`Ctrl+Shift+C` remains an emergency fallback only. For that fallback, fully zoom out and hover the fixed class/Ascendancy start node before pressing the hotkey. The cursor position and display are frozen at hotkey press so later reference sampling cannot shift the anchor.

`Ctrl+Shift+0` clears the stored reference.

Target Lock's reserved recovery hotkeys are protected from the application's older configurable-hotkey refresh path, so a settings refresh cannot silently unregister them.

## Camera tracking

The passive-tree viewport is modeled as:

`screen = tree * scale + offset`

Path of Exile changes uniform scale and X/Y translation during ordinary tree navigation.

After bootstrap/recovery, ExileQuesting tracks textured features across already-confirmed passive-tree frames. Those features have no passive-node identity. The tracker estimates only:

- uniform scale;
- X translation;
- Y translation.

Zoom is modeled around the viewport centre before residual pan is solved. This handles rapid mouse-wheel input without converting a centre zoom into a fake giant translation.

A cheap stationary fast path returns identity motion when the tree has not moved, avoiding unnecessary scale searches and preserving the invariant that a stationary tree produces a stationary reticle.

## Real-client regression corpus

The 2026-09-03 3440x1440 failure recording is represented by sanitized numerical regression cases rather than committing private video frames.

Coverage includes:

- stationary tree where the old marker teleported;
- stationary tooltip interaction;
- rapid ~1.38x, ~1.55x and ~1.62x wheel bursts;
- an accumulated ~2.25x extreme zoom used to exercise wide recovery;
- ordinary pan, zoom-out, occlusion and unrelated-image rejection.

The original failure is therefore part of the future test contract without storing the recording in the repository.

## Fail-closed tracking

A proposed motion is rejected when it lacks enough consistent matches, spread, confidence or sane geometry.

On failure:

1. the reticle is hidden;
2. the previous trusted transform remains authoritative;
3. the failed frame is not promoted to a reference;
4. trusted references/keyframes are tried for recovery;
5. vision never substitutes a different node ID.

A temporarily hidden target is preferable to a confident marker on the wrong passive.

## Multi-keyframe recovery

Healthy tracking maintains a small bank of genuinely different trusted pan/zoom references rather than storing near-duplicates.

On close/reopen or a difficult camera jump, those references can reacquire the same tree view. Failed captures are never promoted into the bank.

Trusted transforms can also be adapted between compatible same-aspect display resolutions by scaling around viewport centre. This avoids per-resolution node tables for 1080p, 1440p and 4K-class displays.

A materially different window aspect remains a separate scope and may require the emergency reference if automatic bootstrap cannot prove a fresh alignment.

## Local target watchdog

Global canvas motion is not the only safety check.

Once the exact target is on screen, ExileQuesting samples a small canonical patch around the projected target. The patch acts only as a watchdog for that already-known node.

- a stable matching patch supports the current transform;
- a persistent allocation-style ring brightening can verify an allocate operation;
- a persistent refund-style dimming can verify a refund operation;
- a gross local disagreement rejects the proposed transform;
- the watchdog never selects another node.

Hover and active cursor interaction are excluded from automatic completion classification. The camera must also be confidently stationary.

## Automatic passive progression

For an exact route, the current target operation may automatically advance after its local visual change is verified persistently across multiple stationary observations.

The operation event contains the current authoritative node ID and allocate/refund type. It does not contain a replacement target.

Advancement uses the same persisted build-planner cursor used by the manual Next Passive action and is deduplicated with a one-shot token. A transient renderer/IPC failure is retried without allowing successful operations to advance twice.

After the cursor advances, the build planner computes the next authoritative node ID and the local watchdog learns a fresh reference for that new target.

If the target has not yet established a clean reference, automatic completion refuses to guess. Manual build progression remains available as the safe fallback.

## Crosshair design

The target uses a hollow gold reticle with:

- a high-contrast circular lock ring;
- four cardinal ticks;
- a tiny hollow centre so the passive artwork remains visible;
- no permanent animation;
- `TAKE THIS NODE` or `REFUND THIS NODE`;
- passive name, node ID and route progress;
- a small Target Lock state indicator while learning/auto-following.

Refund operations use the same visual language with a warmer orange treatment.

The marker radius responds modestly to passive-tree zoom and is clamped to a readable range, so it feels attached to the node without becoming enormous or microscopic.

## Offscreen behavior

The fixed target remains projected in tree-space even when it is outside the visible viewport.

The reticle is replaced by an edge indicator that includes:

- target name and node ID;
- compass direction;
- approximate screen-space distance.

When the node returns onscreen, the same node ID regains the reticle.

## Resolution, class and scope support

There is no per-node pixel database and no per-resolution node table.

Every supported fixed node has one canonical tree coordinate. Monitor size, resolution, DPI, pan and zoom change only the viewport transform.

The same engine applies to all seven base classes and fixed base-tree nodes. Fixed Ascendancy trees use their own local scope/root geometry.

Dynamic cluster-jewel layouts remain a separate modeling problem and are deliberately rejected by fixed-node Target Lock logic.

## Performance

When no exact supported target exists, expensive target tracking is skipped.

When the passive tree is closed, only the low-frequency screen check runs.

When open, ordinary steady-state tracking uses a small PoE capture. The larger capture and radial detector are reserved for bounded automatic bootstrap attempts rather than normal navigation.

Stationary frames take the cheap identity path. Renderer state is fingerprinted so unchanged HUD state is not repeatedly sent to the overlay.

## Capture/recording contract

ExileQuesting must remain recordable by OBS, Discord and Xbox Game Bar.

The target overlay remains transparent, always-on-top and click-through. The v0.2.5 release path installs the capture-safe Electron window policy before the older main bootstrap, overriding the legacy content-protection request without claiming that old line was physically removed.

## v0.2.5 acceptance checklist

Before publication:

- typecheck and all unit/regression tests pass;
- GGG passive data and pinned PoB layout validation pass;
- tree-screen detection passes;
- automatic class/root bootstrap passes all-class/orientation, ambiguity and arbitrary-zoom tests;
- frame motion passes stationary, pan, tooltip, aggressive zoom, zoom-out and unrelated-image fail-closed tests;
- real-client numerical replay corpus passes;
- local target watchdog allocation/refund/mismatch tests pass;
- safe PoB derived-stage routing rejects repaths, unknown/dynamic IDs, mixed scopes and disconnected paths;
- Target Lock visual matrix passes 1080p, 1440p, 3440x1440 and 4K;
- manager/overlay visual checks remain green;
- overlay lifecycle soak passes;
- production Windows installer builds and verifies;
- real v0.2.4 -> v0.2.5 updater handoff passes;
- opening PoE without the passive tree keeps Target Lock hidden;
- stationary passive tree produces a stationary reticle;
- repeated pan/zoom keeps the reticle glued to the same node or fails closed without teleporting;
- offscreen target returns to the same node identity when visible;
- verified passive completion advances exactly one build operation;
- close/reopen recovers from trusted references without ordinary-use recalibration;
- OBS/Game Bar/Discord capture remains functional;
- unfinished Build Doctor functionality remains excluded from v0.2.5.

Do not merge this validation branch into `main` or publish v0.2.5 until the final automated package gates and real-client validation pass.
