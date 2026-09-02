# Passive Tree HUD

Passive Tree HUD is ExileQuesting's visual bridge between build guidance and Path of Exile's in-game passive and Ascendancy trees.

The player-facing goal is simple: open the relevant tree and immediately see the passive decision ExileQuesting can prove from the active build source. The marker follows the visible tree rather than a hard-coded screen coordinate, so panning, zooming, DPI, resolution, ultrawide layouts and monitor placement are handled through live registration.

The HUD is guidance only. It never moves the cursor, clicks a node, injects into Path of Exile, reads process memory, allocates/refunds a passive, or generates game input.

## Supported tree scopes

Passive Tree HUD treats every visible passive-tree canvas as an independently registered scope.

### Base passive tree

All seven base classes use the same data-driven path:

- Scion
- Marauder
- Ranger
- Witch
- Duelist
- Templar
- Shadow

Class starts are derived from GGG's current `tree.classes` + `classStartIndex` data. No Ranger-specific start node ID or resolution-specific coordinate table is used.

This is important because raw GGG class-start node labels are not reliable friendly class names. The generator joins the class table instead of guessing from those labels.

### Ascendancy trees

Ascendancy visual guidance is also supported. GGG's current 3.29 public tree data exposes fixed local group/orbit geometry for every published Ascendancy subtree. The generation-time contract currently resolves:

- 558 fixed Ascendancy nodes;
- 37 independently named GGG Ascendancy/subtree scopes;
- exactly one root/start node per scope;
- zero Ascendancy nodes missing group/orbit placement in the live 3.29 probe.

This includes standard class Ascendancies such as Deadeye, Pathfinder, Occultist, Necromancer, Slayer, Champion, Juggernaut, Inquisitor, Trickster, Ascendant and the other GGG-published fixed subtrees present in the dataset.

The implementation deliberately does **not** keep a hand-written list of node screen positions. If GGG publishes a new fixed Ascendancy scope with the same validated group/orbit contract, the data generator can preserve it without adding a new resolution map.

## Why raw Ascendancy coordinates still work for registration

Path of Building's current `fix_ascendancy_positions.py` documents that GGG's Ascendancy groups arrive with globally scrambled placement. PoB corrects that by translating each Ascendancy as a whole.

That detail matters: the fixer changes the global offset, but it does not rotate, scale or distort the relative geometry inside an Ascendancy.

ExileQuesting therefore does not compare a Deadeye node against the base tree's global coordinate system. Instead it registers each scope locally:

- base target -> base-tree anchors only;
- Deadeye target -> Deadeye anchors only;
- Occultist target -> Occultist anchors only;
- Ascendant target -> Ascendant anchors only;
- mixed PoB stage -> each represented scope is attempted independently and the currently visible, confidently matching tree wins.

The registration solver determines its own scale and translation from the current screen. A scrambled global Ascendancy offset is therefore irrelevant as long as the local node constellation remains correct.

## Build-source semantics

The HUD never claims more precision than the source actually contains.

### Maxroll

A Maxroll planner with ordered passive history provides explicit allocate/refund operations. ExileQuesting can show one exact next operation using the current node ID and bundled 3.29 node identity.

If that operation belongs to an Ascendancy, the HUD automatically switches its expected registration scope to that Ascendancy. It does not keep using the base-class tree anchors.

The Maxroll passive cursor remains independent from character level. Character-level events can advance level-labelled skill/gem stages, but they do not prove how many passive or Ascendancy points were allocated.

### Path of Building

PoB tree stages expose allocation sets rather than a trustworthy click-by-click order. ExileQuesting compares the active tree stage with the previous tree stage and highlights newly-added nodes.

If those additions contain nodes from different scopes, for example ordinary passives plus Ascendancy nodes, ExileQuesting never projects both coordinate systems through one transform. The capture service evaluates the applicable scopes independently and renders only the scope that actually aligns with the tree visible on screen.

It does not invent a click order that PoB never supplied.

## Geometry source contract

The generator reads the public Path of Exile passive-tree page and extracts `passiveSkillTreeData`.

The schema-v2 snapshot preserves:

- passive node ID and name;
- node kind;
- group ID;
- orbit and orbit index;
- graph connections;
- class-start index;
- Ascendancy name and root flag;
- fixed tree-space x/y coordinates;
- global base-tree bounds;
- `skillsPerOrbit`;
- orbit radii.

Current PoE 3.29 generation contains 3,389 named passive definitions. The base-tree contract contains 2,429 positioned static nodes and 402 explicitly dynamic definitions such as Cluster Jewel/mastery definitions that do not represent one fixed base-tree position. Dynamic definitions remain useful for identity/intelligence but are never assigned an invented HUD coordinate.

A v2 snapshot is rejected when a static base-tree node lacks geometry, when one of the seven base-class starts is missing/ambiguous, or when an included Ascendancy scope does not have complete fixed local geometry and exactly one root.

Schema-v1 identity-only snapshots remain readable by textual features, but the visual HUD requires validated schema-v2 geometry.

## Why this is not a pixel map

A table such as `Finesse = x 1214, y 642 at 1920x1080` breaks as soon as the player zooms, pans, changes DPI or uses an ultrawide monitor.

Passive Tree HUD instead maintains two coordinate spaces:

1. **tree space** from GGG group/orbit geometry;
2. **screen space** from the current captured display.

The registration engine solves a positive uniform scale plus translation:

`screen = tree * scale + offset`

Path of Exile does not normally rotate the tree, so rotation is not included. Multiple expected nodes must agree before a transform is accepted.

## Registration pipeline

### Capture

On Windows, Electron `desktopCapturer` provides screen sources. `DesktopCapturerSource.display_id` is matched to Electron `Display.id`, so the captured pixels can be mapped back to the correct monitor bounds.

While searching, the display nearest the cursor is preferred. Once a tree locks, that display remains the first tracking target.

Captures are downscaled for detection and then projected back into the full display coordinate system for the transparent overlay.

### Self-capture prevention

The Passive Tree HUD BrowserWindow is transparent, always-on-top and click-through. On Windows it uses content protection so the overlay is excluded from the desktop capture path instead of detecting its own marker.

### Candidate detection

The detector searches the capture luminance image for repeated radial passive-node geometry across bounded candidate radii. It uses radial contrast/coverage and non-maximum suppression; OCR is not required.

### Scope-aware anchors

The active build supplies the expected node constellation. Anchors can come from:

- recent and upcoming Maxroll operations in the current scope;
- the exact current target;
- PoB stage targets in the current scope;
- graph neighbours from the same scope;
- the correct base-class root for the base tree;
- the correct Ascendancy root for an Ascendancy tree.

Nodes from another scope are excluded. A Deadeye registration cannot quietly borrow Ranger base-tree nodes to inflate its confidence.

### Transform fitting

A bounded pair-based similarity/RANSAC-style search proposes scale + translation transforms. Expected anchors are projected into the capture and matched against detected node centres.

The best transform is refined from its matches. Runtime acceptance remains fail-closed: insufficient inliers, confidence below the threshold or excessive RMS error means the HUD hides rather than leaving a stale marker on the wrong node.

### Tracking

The service searches more slowly when no tree is registered and polls faster while locked. Pan or zoom changes cause the transform to be solved again from visible geometry.

## HUD behavior

For ordered Maxroll progression the HUD can render:

- a high-visibility ring on the exact next passive or Ascendancy node;
- `NEXT PASSIVE` or `REFUND PASSIVE`;
- node name/kind;
- operation index / total;
- current tree scope, for example `Deadeye Ascendancy`;
- subtle recent/upcoming same-scope path preview;
- an edge indicator if the target is outside the visible viewport.

For PoB stages the HUD highlights the newly-added nodes belonging to the currently visible scope and shows a `POB STAGE PASSIVES` legend. It does not render an exact-target ring unless the source actually supplies an ordered operation.

The ordinary campaign/build overlay remains a separate window.

## Resolution, ultrawide and DPI

There are no coordinate tables for individual resolutions.

The permanent Windows Passive Tree HUD visual harness exercises:

- 1920x1080;
- 2560x1440;
- 3440x1440 ultrawide;
- 3840x2160;
- 100%, 125% and 150% forced device scale factors.

It covers these states separately:

- base exact allocate;
- base exact refund;
- base PoB stage;
- base off-screen target;
- Ascendancy exact allocate;
- Ascendancy exact refund;
- Ascendancy PoB stage;
- Ascendancy off-screen target.

That produces 96 state/resolution/DPI captures per full Windows gate, with assertions for expected labels, marker/edge presence and horizontal/vertical overflow.

## Fail-closed behavior

The HUD hides and reports a reason when:

- no active supported passive guidance exists;
- Maxroll node IDs are stale/incompatible;
- bundled geometry is missing/corrupt;
- a target is dynamic or otherwise lacks proven fixed geometry;
- the expected tree does not expose enough visible nodes to register;
- registration confidence is too low;
- residual error is too high;
- desktop capture cannot be mapped unambiguously to a display.

Textual Build Coach guidance remains available when visual registration cannot be proven.

## Safety boundary

Passive Tree HUD is observation + visualization only.

Implemented:

- public GGG passive-tree data;
- existing user-selected `Client.txt` parsing;
- visible-screen capture for alignment;
- transparent click-through rendering;
- imported Maxroll/PoB guidance.

Not implemented:

- process-memory reading;
- DLL/process injection;
- cursor movement;
- simulated clicks/keypresses;
- automatic passive/Ascendancy allocation or refund;
- gameplay automation.

ExileQuesting should not describe itself as officially approved or endorsed by Grinding Gear Games.

## Validation

Permanent automated coverage includes:

- schema-v1 compatibility and strict schema-v2 geometry validation;
- all seven canonical base-class starts;
- all bundled fixed GGG Ascendancy scopes and roots;
- scope separation between base tree and Ascendancies;
- real bundled Deadeye local-geometry registration under arbitrary translation;
- class/Ascendancy registration-anchor selection;
- graph-neighbour/path anchoring;
- scale/translation solving and reprojection;
- synthetic pan/zoom/resolution cases;
- false-registration rejection;
- off-screen indicator geometry;
- display/capture coordinate conversion;
- Maxroll exact allocate/refund semantics;
- PoB unordered-stage semantics;
- Windows manager/Gear Coach/overlay visual gates;
- the 96-state Passive Tree HUD matrix;
- packaged overlay lifecycle soak;
- NSIS installer creation/verification;
- real previous-stable -> candidate updater handoff, relaunch and uninstall.

The final thing automation cannot manufacture is the player's real Path of Exile pixels. The geometry, rejection behavior, packaged Electron window and synthetic visual states can be release-gated, but the detector thresholds still need an in-game playtest against the live client. If the current GGG rendering differs from the synthetic/radial detector assumptions, the system is designed to stay hidden rather than put a marker on an unproven node; diagnostics then give us a controlled calibration target.
