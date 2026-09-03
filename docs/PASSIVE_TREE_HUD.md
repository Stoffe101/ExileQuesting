# Passive Tree HUD

Passive Tree HUD is ExileQuesting's visual bridge between build guidance and Path of Exile's in-game passive and Ascendancy trees.

The player-facing goal is simple: when ExileQuesting has passive guidance and the player opens the relevant in-game tree, show the passive decision at the actual node. Keep the marker attached to the visible tree through ordinary pan/zoom changes instead of hard-coding one screen coordinate.

The HUD is guidance only. It never moves the cursor, clicks a node, injects into Path of Exile, reads process memory, allocates/refunds a passive, or generates game input.

## Visibility and performance contract

The passive HUD must not behave like a permanent game overlay.

When Path of Exile is running but the passive tree is closed, the transparent HUD window remains hidden and the expensive registration path does not run. The service performs only a small, low-frequency Path of Exile **window** thumbnail probe and looks for the structural distribution of passive-tree nodes.

Only after that cheap gate says the passive tree is visible does ExileQuesting perform accurate registration. While locked, ordinary pan/zoom changes are handled with a local transform tracker first. Full point-cloud reacquisition is reserved for larger jumps or loss of the previous transform.

The renderer is intentionally static. The target ring, route path and labels have no infinite pulse animation, SVG drop-shadow filter or transition loop. UI state is repainted only when alignment/target state actually changes.

This architecture was informed by Exile-UI's current approach at `Lailloken/Exile-UI@3152d169dbbc3dc19308b42ac4b3f45538713070`: Exile-UI checks a tiny resolution-relative `skilltree` screen region before enabling its passive-tree feature. ExileQuesting adopts the cheap-gate-first principle, but keeps its own live GGG-coordinate registration so the player is not tied to Exile-UI's fixed schematic alignment/full-zoom-out workflow.

## Supported tree scopes

Passive Tree HUD treats every visible passive-tree canvas as an independently registered scope.

### Base passive tree

All seven base classes use the same data-driven path: Scion, Marauder, Ranger, Witch, Duelist, Templar and Shadow.

Class starts are derived from GGG's current `tree.classes` + `classStartIndex` data. No Ranger-specific start node ID or resolution-specific coordinate table is used. Raw GGG class-start labels are not assumed to be friendly class names; the generator joins the canonical class table instead.

### Ascendancy trees

Ascendancy visual guidance is supported through local scope registration. GGG's current PoE 3.29 public tree data exposes fixed local group/orbit geometry for every published Ascendancy subtree. The generation-time contract currently resolves 558 fixed Ascendancy nodes across 37 named GGG scopes, with exactly one root per scope and zero missing group/orbit placements in the live probe.

ExileQuesting does not keep a hand-written list of node screen positions. New fixed GGG scopes using the validated group/orbit contract can flow through the generator without adding a resolution map.

## Why raw Ascendancy coordinates still work

Path of Building's current `fix_ascendancy_positions.py` documents that GGG's Ascendancy groups arrive with globally scrambled placement. PoB corrects them by translating each Ascendancy as a whole. That preserves the relative node geometry inside each Ascendancy.

ExileQuesting uses that property instead of copying PoB's hard-coded global centres. Registration is scope-local:

- base target -> base-tree anchors only;
- Deadeye target -> Deadeye anchors only;
- Occultist target -> Occultist anchors only;
- Ascendant target -> Ascendant anchors only;
- mixed PoB stage -> each represented scope is attempted independently and the currently visible confident match wins.

The registration solver determines its own scale and translation from the current game window, so the globally scrambled Ascendancy offset is irrelevant to local registration.

## Build-source semantics

The HUD never claims more precision than the imported source contains.

### Maxroll

A Maxroll planner with ordered passive history provides explicit allocate/refund operations. ExileQuesting can show one exact next operation using the node ID and bundled 3.29 identity. If the target belongs to an Ascendancy, the expected registration scope switches to that Ascendancy automatically.

The passive cursor remains independent from character level. Level events can advance skill/gem milestones, but they do not prove passive or Ascendancy allocations.

### Path of Building

PoB tree stages expose allocation sets rather than a trustworthy click-by-click order. ExileQuesting compares the active stage with the previous tree stage and highlights newly-added nodes.

If those additions span base and Ascendancy scopes, ExileQuesting never projects both through one transform. It evaluates each scope independently and renders only the scope that aligns with the tree currently visible on screen. It does not claim a source-authored click order that PoB never encoded.

A future derived-order layer may offer one legal graph path through an unordered stage, but that must be clearly labelled as ExileQuesting-derived and must fail closed around refunds, masteries or ambiguous/special allocation mechanics.

## Passive-point availability

The HUD has explicit `waiting-point` and `waiting-tree` states.

When ExileQuesting can **prove** that zero points are available, the HUD does not probe or render the tree. At the very start of a character, level-earned points plus acknowledged ordered operations can prove this before quest rewards exist.

A `/passives` command report can also provide exact total/allocated point evidence at the moment the report is parsed. That report is a snapshot, not a permanent live counter: Path of Exile does not emit every passive allocation or point gain to `Client.txt`. ExileQuesting therefore must not keep treating a stale zero as authoritative after the game state may have changed.

Unknown is kept distinct from zero. The project will not add process-memory reads simply to obtain a live passive-point counter.

## Geometry source contract

The generator reads the public Path of Exile passive-tree page and extracts `passiveSkillTreeData`.

Schema v2 preserves node identity/kind, group, orbit/orbit index, graph connections, class-start index, Ascendancy name/root flag, fixed x/y coordinates, global base-tree bounds, `skillsPerOrbit` and orbit radii.

Current PoE 3.29 generation contains 3,389 named passive definitions. The base-tree contract includes 2,429 positioned static nodes and 402 explicitly dynamic definitions such as Cluster Jewel/mastery definitions that do not represent one fixed position. Dynamic definitions are never assigned invented HUD coordinates.

A schema-v2 snapshot is rejected when a static base node lacks geometry, one of the seven base starts is missing/ambiguous, or an included Ascendancy scope lacks complete fixed local geometry or exactly one root.

Schema-v1 identity-only data remains readable for textual features, but the visual HUD requires validated schema-v2 geometry.

## Registration architecture

There are no pixel-coordinate tables. Passive Tree HUD maintains tree space from GGG geometry and screen space from the current Path of Exile window capture, then solves:

`screen = tree * scale + offset`

Path of Exile does not normally rotate the tree, so rotation is not included. Multiple expected nodes must agree before a transform is accepted.

### Cheap tree-open gate

While unlocked, ExileQuesting requests a small PoE window thumbnail and runs a deliberately cheaper radial-node detector. A passive-tree presence gate then requires:

- enough radial candidates;
- candidates spread across multiple screen regions;
- meaningful horizontal and vertical span;
- enough candidates in the client **interior**, so ordinary gameplay HUD circles around the edges cannot activate the tree overlay by themselves.

This gate only answers “does this look structurally like the passive tree?” It never supplies final node coordinates.

### Accurate candidate detection

After the gate passes, the accurate detector searches the larger game-window capture for repeated radial passive-node geometry at bounded radii using radial contrast/coverage and non-maximum suppression. OCR is not required.

The capture targets the Path of Exile window rather than continuously capturing the full desktop. This prevents the passive HUD from paying for unrelated monitor pixels and prevents its own transparent overlay from becoming useful registration evidence.

### Scope-aware anchors

Expected anchors come from recent/upcoming ordered operations in the current scope, the current exact target, PoB stage targets in the current scope, same-scope graph neighbours, the appropriate base-class root or the appropriate Ascendancy root.

Nodes from other scopes are excluded. A Deadeye registration cannot borrow Ranger base-tree nodes to inflate confidence.

### Initial transform fitting

A bounded pair-based similarity/RANSAC-style search proposes scale + translation transforms. The best transform is refined from matched visible nodes and rejected when inliers/confidence are insufficient or RMS error is excessive.

### Local pan/zoom tracking

Once a transform is proven, ExileQuesting does not immediately repeat the full pair search every poll. The tracker evaluates a small set of scale factors near the previous lock and lets anchor/candidate pairs vote for nearby translation offsets. The strongest local hypotheses are refined with the same least-squares transform solver and must still pass inlier/RMS/confidence bounds.

Normal pan and modest zoom therefore follow the previous tree cheaply. A large jump, changed viewport or lost lock fails the local tracker and falls back to full registration. If the passive-tree structure disappears, the HUD is hidden instead of leaving a stale marker on normal gameplay.

## HUD behavior

Ordered Maxroll guidance can render a high-visibility **static** ring on the exact next base or Ascendancy node, `NEXT PASSIVE` / `REFUND PASSIVE`, node name/kind, operation progress, a scope label such as `Deadeye Ascendancy`, same-scope path preview and an off-screen edge indicator.

PoB stages currently highlight newly-added nodes in the currently visible scope with a `POB STAGE PASSIVES` legend. They do not get a fabricated source-authored exact-target ring.

The normal campaign/build overlay remains a separate window.

## Resolution, ultrawide and DPI validation

The permanent Windows visual harness covers 1920x1080, 2560x1440, 3440x1440 ultrawide and 3840x2160 at 100%, 125% and 150% forced device scale factors.

The structural tree-open gate is separately unit-tested at 1920x1080, 2560x1440, 3440x1440 and 5120x1440, plus false-positive layouts made from dense bottom-edge/outer-edge circles.

The transform tests cover synthetic pan/zoom without resolution-specific coordinates. Local tracking separately covers stable lock, pan, modest zoom+pan, unrelated candidate fields and a deliberately too-large jump that must fail so full reacquisition can take over.

The Windows visual matrix exercises:

- base exact allocate;
- base exact refund;
- base PoB stage;
- base off-screen target;
- Ascendancy exact allocate;
- Ascendancy exact refund;
- Ascendancy PoB stage;
- Ascendancy off-screen target.

## Display/window assumptions

Exact pixel mapping currently targets the display containing the full-screen or borderless Path of Exile client. The capture itself comes from the PoE window and display choice is resolved from the previous lock, aspect ratio and cursor display.

A freely resized, offset windowed PoE client does not expose its native window bounds through the current Electron capture contract. ExileQuesting should fail closed or add a reviewed Windows window-bounds seam before claiming exact mapping for arbitrary offset windowed mode.

## Fail-closed behavior

The HUD hides and reports a reason when there is no supported guidance, a proven zero-point state exists, bundled geometry is corrupt, the target is dynamic/unpositioned, the passive tree is closed, the expected tree cannot produce enough visible candidates, registration confidence is too low, residual error is too high, or game-window capture fails.

Weak tracking frames never leave a stale marker over ordinary gameplay. Textual Build Coach guidance remains the fallback.

## Safety boundary

Passive Tree HUD is observation + visualization only. It uses public GGG passive data, the existing user-selected `Client.txt` pipeline, visible game-window capture and transparent click-through rendering.

It does not read process memory, inject into the game, move the cursor, simulate clicks/keypresses, allocate/refund passives or automate gameplay. ExileQuesting should not describe itself as officially approved or endorsed by Grinding Gear Games.

## Permanent validation

Coverage includes schema-v1 compatibility, strict v2 geometry, all seven base starts, every bundled fixed GGG Ascendancy scope/root, base/Ascendancy scope separation, real bundled Deadeye local-geometry registration under arbitrary translation, graph/path anchoring, transform solving, simulated pan/zoom/resolutions, tree-open false-positive rejection, local tracking/reacquisition boundaries, off-screen geometry, display mapping, Maxroll exact allocate/refund semantics, PoB unordered stages, static-render budget regression, manager/Gear Coach/overlay visuals, the Passive Tree HUD Windows visual matrix, overlay lifecycle soak, NSIS packaging and a real previous-stable -> candidate updater/relaunch/uninstall rehearsal.

## Real-client calibration boundary

Release automation can prove current GGG geometry, the visibility/transform/rejection algorithms, packaged Electron behavior, static renderer rules, resolution/DPI rendering and the updater. It cannot manufacture the exact pixels rendered by the player's Path of Exile client and graphics/UI settings.

The next in-game run is therefore the detector/calibration test for the new cheap tree-open gate and game-window capture path. Expected failure behavior is safe: if live passive-tree rendering does not satisfy the detector thresholds, the HUD stays hidden rather than drawing an unproven marker. Diagnostics then provide a controlled calibration target without changing the underlying build or tree geometry.

Working tree: post-v0.2.3 Passive Tree HUD hardening.
