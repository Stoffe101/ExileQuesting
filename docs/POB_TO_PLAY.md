# PoB to Play

This document records the design contract for ExileQuesting's v0.2 build planner. The goal is not to reproduce Path of Building's calculation engine. The goal is to translate a guide author's PoB into a small, reliable sequence of things a player should do while leveling.

## Product rule

A PoB is evidence, not an instruction list.

ExileQuesting may infer a stage relationship only when it has a defensible signal. When the source build is ambiguous, the planner must surface that ambiguity instead of inventing a confident gem, gear, passive, or vendor instruction.

## Current upstream baseline

Research baseline at the start of v0.2:

- Path of Exile 1 target data: 3.29-era campaign/build data;
- Path of Building Community: current PoE1 repository, default `dev` branch;
- Path of Building release observed during research: v2.67.2, published 2026-08-07;
- ExileQuesting release base: v0.1.4, commit `d1f59724cc28848e8139cb713c8d8828499fe00e`.

The implementation must tolerate newer PoB versions where the XML remains compatible. Version-specific assumptions belong in tests/provenance rather than scattered UI code.

## What modern PoB actually saves

### Export envelope

Current PoB generates share codes from its XML database using Deflate, Base64, then URL-safe substitutions. ExileQuesting already supports the corresponding bounded decode path.

Primary reference:

- `PathOfBuildingCommunity/PathOfBuilding/src/Classes/ImportTab.lua`

### Passive trees are not normal set IDs

Modern PoB saves:

```xml
<Tree activeSpec="2">
  <Spec title="Level 12" treeVersion="3_29" ... />
  <Spec title="Level 28" treeVersion="3_29" ... />
</Tree>
```

`Tree.activeSpec` is a one-based ordinal into the passive spec list. `Spec` does not receive an `id` from `TreeTab:Save`; `PassiveSpec:Save` writes title, tree version, class/ascendancy IDs, node IDs and mastery selections.

Therefore:

- never use `treeVersion` as a passive stage ID;
- never compare `activeSpec` to `treeVersion`;
- preserve a stable ExileQuesting-local identity such as `tree:2`;
- retain tree version and allocated nodes as stage metadata.

Primary references:

- `PathOfBuildingCommunity/PathOfBuilding/src/Classes/TreeTab.lua`
- `PathOfBuildingCommunity/PathOfBuilding/src/Classes/PassiveSpec.lua`

### Skill, item and configuration sets have their own IDs

Modern PoB saves independent native set IDs and active IDs for:

- `SkillSet` / `activeSkillSet`;
- `ItemSet` / `activeItemSet`;
- `ConfigSet` / `activeConfigSet`.

Those IDs are useful within their own family. They are not evidence that SkillSet 2, ItemSet 2 and ConfigSet 2 describe the same leveling phase.

Primary references:

- `PathOfBuildingCommunity/PathOfBuilding/src/Classes/SkillsTab.lua`
- `PathOfBuildingCommunity/PathOfBuilding/src/Classes/ItemsTab.lua`
- `PathOfBuildingCommunity/PathOfBuilding/src/Classes/ConfigTab.lua`

## Loadout alignment

PoB's **New Loadout** action creates a passive spec, item set, skill set and configuration set and assigns the same user-entered title to all four. `SyncLoadouts()` also contains support for linked-title tokens such as `{token}` and one-set-family special cases.

That produces the v0.2 confidence ladder:

1. **High** — exact normalized title across independent families, or the same explicit `{token}` convention.
2. **Medium** — unique semantic milestone across titles, such as `Level 28 tree`, `Lvl 28 gems`, `28`.
3. **Low** — ordinal fallback only when every multi-stage family has the same count and no stronger signal already aligned those entries.
4. **Ambiguous** — no safe relationship. Do not silently pair the sets.

A family with exactly one set may apply to every aligned stage, but it is not evidence that two unrelated multi-stage families belong together.

Primary reference:

- `PathOfBuildingCommunity/PathOfBuilding/src/Modules/Build.lua`, `SyncLoadouts()` and New Loadout creation.

## Stage model

An aligned stage is a view over independent PoB sets, not a new copy of the source build.

Conceptually:

```text
BuildStage
  title
  confidence
  milestone
    level | act | phase | unknown
  tree?   -> PobStageSummary
  skills? -> PobStageSummary
  items?  -> PobStageSummary
  config? -> PobStageSummary
  reasons[]
```

The alignment engine lives in `src/core/pob-stages.ts` and is deterministic/testable without Electron or network access.

## Passive milestones

Each passive stage may retain:

- tree version;
- class ID;
- ascendancy ID;
- secondary ascendancy ID;
- allocated node IDs;
- mastery node/effect selections.

The planner can later diff stage N against stage N+1 to produce a small milestone such as:

```text
PASSIVES
Next target: Elemental Overload cluster
8 new passive allocations before Level 28 stage
Ascendancy changes at First Lab
```

A raw node ID is never useful player-facing copy. Node names/positions require a version-pinned passive-tree dataset before they are presented to the player.

## Gem acquisition data

Gem identity and gem acquisition are separate datasets.

### Quest rewards

GGG game data still exposes useful quest-reward relationships through data such as:

- Quest;
- QuestRewardOffers;
- QuestRewards;
- NPCTalk;
- NPCs;
- BaseItemTypes;
- Characters.

These can establish which class can choose a gem from a quest and which NPC/reward offer is involved.

### Vendor availability

Do not design a new pipeline around `QuestVendorRewards.dat`: current open-source leveling-tool research records that this table no longer exists.

A current practical source is PoE Wiki Cargo's `vendor_rewards` data joined with item metadata. The MIT-licensed `HeartofPhos/exile-leveling` project is useful as a reference implementation and explicitly combines GGG quest-reward data with wiki vendor data.

Reference:

- `HeartofPhos/exile-leveling/seeding/src/seeding/quests.ts`
- license: MIT

ExileQuesting should build its own normalized snapshot and retain source provenance rather than runtime-scraping another tool's output.

### Runtime rule

The installed app must not need PoE Wiki to be online while a player is leveling. Vendor/quest data is generated and validated ahead of time, then bundled or updated as a versioned data package.

## Data provenance contract

Every generated build/game-data snapshot should carry at least:

```json
{
  "schemaVersion": 1,
  "gameVersion": "3.29",
  "generatedAt": "ISO-8601 timestamp",
  "sources": [
    {
      "name": "source name",
      "revision": "commit/build/revision when available",
      "url": "human-readable source URL",
      "license": "license or data-use note"
    }
  ],
  "sha256": "checksum of normalized payload"
}
```

Game data, campaign data, PoB parser compatibility and application version are independent version axes.

## Planned deterministic pipeline

```text
PoB XML / export / pobb.in
        |
        v
bounded decoder + parser
        |
        +--> tree stages
        +--> skill stages
        +--> item stages
        +--> config stages
        |
        v
confidence-rated stage alignment
        |
        v
active BuildStage
        |
        +--> gem requirements
        |      +--> quest reward lookup
        |      +--> vendor lookup
        |      +--> Siosa/Lilly fallback
        |
        +--> socket/link/colour targets
        +--> passive diff
        +--> notes/source hints
        |
        v
semantic build actions
        |
        v
campaign overlay BUILD block
```

## Planned player-facing hierarchy

The overlay should not become a second PoB window.

Example:

```text
BUILD
Level 28 transition ready
Buy Armageddon Brand in town
Swap main link to B-B-R
Next passive milestone: 6 points
```

Details, explanations and uncertainty belong in the manager/Coach view. Focus mode receives only the next useful build decision.

## Safety boundary

PoB to Play remains advisory:

- it may parse files/text the user supplies;
- it may read public/static build metadata;
- it may show what to buy/socket/allocate next;
- it does not click vendors, allocate passives, socket gems, modify items, or issue gameplay input.

The product rule remains: **we observe and advise; we never play.**
