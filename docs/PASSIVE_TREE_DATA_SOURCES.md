# Passive Tree data sources and authority

ExileQuesting deliberately separates the source of Path of Exile passive-tree data from the reference implementation used to validate how that data is interpreted.

## 1. Grinding Gear Games: raw game data

The bundled PoE 1 passive snapshot is generated from Grinding Gear Games' `grindinggear/skilltree-export` repository at a pinned revision. GGG is the authoritative upstream source for node IDs, groups, orbit indices, connectivity, names, constants and other game-owned passive-tree data.

Raw data is not assumed to be presentation-ready merely because it parses.

## 2. Path of Building Community: canonical layout interpretation

Path of Building Community is ExileQuesting's canonical reference for interpreting and validating the PoE 1 passive-tree layout.

For PoE 3.29 ExileQuesting pins:

- repository: `PathOfBuildingCommunity/PathOfBuilding`
- commit: `ed354c2f8c42e148bc904c7508dbe851fb2cf952`
- tree version: `3_29`
- tree file: `src/TreeData/3_29/tree.lua`
- tree blob: `3086d40c72d926484c7d52b563ad686a5627a12a`

PoB is used as the reference for:

- the seven canonical class-start node IDs;
- `classStartIndex` interpretation;
- orbit counts and orbit radii;
- the group/orbit/orbit-index to x/y formula;
- base-tree bounds;
- Ascendancy start identity and the fact that raw GGG Ascendancy placement requires normalization before being treated as a global presentation layout.

The current pinned base starts are:

| Class | PoB 3.29 start node |
| --- | ---: |
| Scion | 58833 |
| Marauder | 47175 |
| Ranger | 50459 |
| Witch | 54447 |
| Duelist | 50986 |
| Templar | 61525 |
| Shadow | 44683 |

The v0.2.5 regression contract also pins the Witch's first `Spell Damage and Mana` node (`57264`) and verifies its local geometry relative to Witch start `54447`. This is the exact early-tree case visible in the user's v0.2.4 failure recording.

Generation and CI validation must fail when ExileQuesting's generated 3.29 geometry disagrees with these pinned PoB invariants. A future league/tree update must update the GGG source pin and PoB reference together after review rather than silently accepting drift.

## 3. Exile-UI: in-game overlay workflow reference

Exile-UI is used as prior art for the runtime interaction model, particularly its lightweight client-relative passive-tree screen check and its practical fully-zoomed-out schematic/re-alignment workflow.

ExileQuesting does not use Exile-UI as the source of passive node identities or coordinates. That responsibility belongs to GGG data validated against PoB.

## Runtime rule

The v0.2.5 Passive Tree HUD should not infer the passive-tree graph from a cloud of circular screen features. It should:

1. fail closed unless the calibrated passive-tree UI is actually visible;
2. use the PoB-validated tree-space coordinates for the active build nodes;
3. map that tree space into the known game/display coordinate space from a deliberate class-start or Ascendancy-start calibration;
4. remain hidden whenever the projection cannot be proven for the current client geometry.

This keeps game-data correctness, layout interpretation and screen detection as separate responsibilities instead of mixing them into one fragile computer-vision registration loop.
