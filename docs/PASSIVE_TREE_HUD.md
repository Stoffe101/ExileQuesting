# Passive Tree HUD

Passive Tree HUD is ExileQuesting's visual bridge between build guidance and Path of Exile's in-game passive and Ascendancy trees.

The player-facing goal is simple: open the relevant tree and immediately see the passive decision ExileQuesting can prove from the active build source. The marker follows the visible tree rather than a hard-coded screen coordinate, so panning, zooming, DPI, resolution, ultrawide layouts and monitor placement are handled through live registration.

The HUD is guidance only. It never moves the cursor, clicks a node, injects into Path of Exile, reads process memory, allocates/refunds a passive, or generates game input.

## Supported tree scopes

Passive Tree HUD treats every visible passive-tree canvas as an independently registered scope.

### Base passive tree

All seven base classes use the same data-driven path: Scion, Marauder, Ranger, Witch, Duelist, Templar and Shadow.

Class starts are derived from GGG's current `tree.classes` + `classStartIndex` data. No Ranger-specific start node ID or resolution-specific coordinate table is used. Raw GGG class-start labels are not assumed to be friendly class names; the generator joins the canonical class table instead.

### Ascendancy trees

Ascendancy visual guidance is supported through local scope registration. GGG's current PoE 3.29 public tree data exposes fixed local group/orbit geometry for every published Ascendancy subtree. The generation-time contract currently resolves 558 fixed Ascendancy nodes across 37 named GGG scopes, with exactly one root per scope and zero missing group/orbit placements in the live probe.

This includes standard class Ascendancies such as Deadeye, Pathfinder, Occultist, Necromancer, Slayer, Champion, Juggernaut, Inquisitor, Trickster and Ascendant, plus the other fixed GGG-published subtrees present in the dataset.

ExileQuesting does not keep a hand-written list of node screen positions. New fixed GGG scopes using the validated group/orbit contract can flow through the generator without adding a resolution map.

## Why raw Ascendancy coordinates still work

Path of Building's current `fix_ascendancy_positions.py` documents that GGG's Ascendancy groups arrive with globally scrambled placement. PoB corrects them by translating each Ascendancy as a whole. That preserves the relative node geometry inside each Ascendancy.

ExileQuesting uses that property instead of copying PoB's hard-coded global centres. Registration is scope-local:

- base target -> base-tree anchors only;
- Deadeye target -> Deadeye anchors only;
- Occultist target -> Occultist anchors only;
- Ascendant target -> Ascendant anchors only;
- mixed PoB stage -> each represented scope is attempted independently and the currently visible confident match wins.

The registration solver determines its own scale and translation from the current screen, so the globally scrambled Ascendancy offset is irrelevant to local registration.

## Build-source semantics

The HUD never claims more precision than the imported source contains.

### Maxroll

A Maxroll planner with ordered passive history provides explicit allocate/refund operations. ExileQuesting can show one exact next operation using the node ID and bundled 3.29 identity. If the target belongs to an Ascendancy, the expected registration scope switches to that Ascendancy automatically.

The passive cursor remains independent from character level. Level events can advance skill/gem milestones, but they do not prove passive or Ascendancy allocations.

### Path of Building

PoB tree stages expose allocation sets rather than a trustworthy click-by-click order. ExileQuesting compares the active stage with the previous tree stage and highlights newly-added nodes.

If those additions span base and Ascendancy scopes, ExileQuesting never projects both through one transform. It evaluates each scope independently and renders only the scope that aligns with the tree currently visible on screen. It does not invent a click order.

## Geometry source contract

The generator reads the public Path of Exile passive-tree page and extracts `passiveSkillTreeData`.

Schema v2 preserves node identity/kind, group, orbit/orbit index, graph connections, class-start index, Ascendancy name/root flag, fixed x/y coordinates, global base-tree bounds, `skillsPerOrbit` and orbit radii.

Current PoE 3.29 generation contains 3,389 named passive definitions. The base-tree contract includes 2,429 positioned static nodes and 402 explicitly dynamic definitions such as Cluster Jewel/mastery definitions that do not represent one fixed position. Dynamic definitions are never assigned invented HUD coordinates.

A schema-v2 snapshot is rejected when a static base node lacks geometry, one of the seven base starts is missing/ambiguous, or an included Ascendancy scope lacks complete fixed local geometry or exactly one root.

Schema-v1 identity-only data remains readable for textual features, but the visual HUD requires validated schema-v2 geometry.

## Registration architecture

There are no pixel-coordinate tables. Passive Tree HUD maintains tree space from GGG geometry and screen space from the current captured display, then solves:

`screen = tree * scale + offset`

Path of Exile does not normally rotate the tree, so rotation is not included. Multiple expected nodes must agree before a transform is accepted.

### Capture and self-capture prevention

On Windows, Electron `desktopCapturer` screen sources are matched to Electron displays. Captures are downscaled for detection and mapped back to the full display bounds for rendering.

The transparent HUD BrowserWindow is always-on-top, click-through and content-protected so it does not feed its own marker back into desktop capture.

### Candidate detection

The detector searches capture luminance for repeated radial passive-node geometry at bounded radii using radial contrast/coverage and non-maximum suppression. OCR is not required.

### Scope-aware anchors

Expected anchors come from recent/upcoming Maxroll operations in the current scope, the current exact target, PoB stage targets in the current scope, same-scope graph neighbours, the appropriate base-class root or the appropriate Ascendancy root.

Nodes from other scopes are excluded. A Deadeye registration cannot borrow Ranger base-tree nodes to inflate confidence.

### Transform fitting and tracking

A bounded pair-based similarity/RANSAC-style search proposes scale + translation transforms. The best transform is refined from matched visible nodes and rejected when inliers/confidence are insufficient or RMS error is excessive.

The service searches more slowly while unlocked and faster while locked. Pan/zoom changes force the visible geometry to prove a new transform. Weak frames hide the HUD rather than leaving stale coordinates on screen.

## HUD behavior

Ordered Maxroll guidance can render a high-visibility ring on the exact next base or Ascendancy node, `NEXT PASSIVE` / `REFUND PASSIVE`, node name/kind, operation progress, a scope label such as `Deadeye Ascendancy`, same-scope path preview and an off-screen edge indicator.

PoB stages highlight newly-added nodes in the currently visible scope with a `POB STAGE PASSIVES` legend. They do not get a fabricated exact-target ring.

The normal campaign/build overlay remains a separate window.

## Resolution, ultrawide and DPI validation

The permanent Windows visual harness covers 1920x1080, 2560x1440, 3440x1440 ultrawide and 3840x2160 at 100%, 125% and 150% forced device scale factors.

Each resolution/DPI combination exercises eight states:

- base exact allocate;
- base exact refund;
- base PoB stage;
- base off-screen target;
- Ascendancy exact allocate;
- Ascendancy exact refund;
- Ascendancy PoB stage;
- Ascendancy off-screen target.

That is 96 state/resolution/DPI captures in the full Windows gate, with assertions for marker/edge/legend content and overflow.

## Fail-closed behavior

The HUD hides and reports a reason when there is no supported guidance, Maxroll IDs are stale, bundled geometry is corrupt, the target is dynamic/unpositioned, the expected tree cannot produce enough visible candidates, registration confidence is too low, residual error is too high, or desktop capture cannot map to a display unambiguously.

Textual Build Coach guidance remains the fallback.

## Safety boundary

Passive Tree HUD is observation + visualization only. It uses public GGG passive data, the existing user-selected `Client.txt` pipeline, visible-screen capture and transparent click-through rendering.

It does not read process memory, inject into the game, move the cursor, simulate clicks/keypresses, allocate/refund passives or automate gameplay. ExileQuesting should not describe itself as officially approved or endorsed by Grinding Gear Games.

## Permanent validation

Coverage includes schema-v1 compatibility, strict v2 geometry, all seven base starts, every bundled fixed GGG Ascendancy scope/root, base/Ascendancy scope separation, real bundled Deadeye local-geometry registration under arbitrary translation, graph/path anchoring, transform solving, simulated pan/zoom/resolutions, false-registration rejection, off-screen geometry, display mapping, Maxroll exact allocate/refund semantics, PoB unordered stages, manager/Gear Coach/overlay visuals, the 96-state Passive Tree HUD matrix, overlay lifecycle soak, NSIS packaging and a real previous-stable -> candidate updater/relaunch/uninstall rehearsal.

## Real-client calibration boundary

Release automation can prove current GGG geometry, the transform/rejection algorithms, packaged Electron behavior, resolution/DPI rendering and the updater. It cannot manufacture the exact pixels rendered by the player's Path of Exile client and graphics/UI settings.

The first v0.2.1 in-game run is therefore also the final detector-calibration test. Expected failure behavior is safe: if live node rendering does not satisfy the detector thresholds, the HUD stays hidden/searching rather than drawing an unproven marker. Diagnostics then provide a controlled calibration target without changing the underlying build or tree geometry.
