# Build-aware campaign intelligence

This document describes the first integrated ExileQuesting build-intelligence layer for Path of Exile 1 patch 3.29.

The design goal is not to automate gameplay or pretend the game exposes data that it does not. ExileQuesting turns the active Path of Building profile and stage into deterministic campaign guidance, passive milestones, gem acquisition fallbacks, crafting reminders, and a generated leveling loot-filter layer.

## Patch 3.29 socket semantics

PoE 3.29 changed equipment sockets substantially. Gems can be socketed into any equipment socket regardless of colour. Matching a red, green, or blue gem with the same non-white socket colour grants +10% gem Quality instead of determining whether the gem can be equipped. Newly generated sockets are white by default.

ExileQuesting therefore treats:

- **link count as the functional requirement**;
- **matching non-white colours as an optional quality optimisation**;
- linked red-green-blue items as Chromatic Orb vendor-recipe candidates;
- six-socket and six-linked items as their respective vendor-recipe/value cases.

Current references:

- GGG 3.29.0 patch notes: https://www.pathofexile.com/forum/view-thread/3985332
- GGG item-filter syntax reference: https://www.pathofexile.com/item-filter/about

## BUILD overlay

Compact, Focus, and Coach overlays have a dedicated BUILD block instead of mixing build actions into the ordinary route-action hierarchy.

Depending on mode and available data it can show:

- build-specific gem acquisition actions attached to the current campaign step;
- the next passive-tree milestone;
- named keystones/notables when the PoB tree version matches bundled passive data;
- current-stage gem tasks and source/timing confidence in Coach mode.

Build actions are still represented by the same semantic campaign action model used by the rest of ExileQuesting. The separate block is presentation, not a second progression engine.

## Gem fallback acquisition

Normal class-valid starting, quest, and vendor sources remain preferred.

When those do not cover a requirement, the planner can expose cross-class fallbacks:

- **Siosa** after *A Fixture of Fate*;
- **Lilly Roth** after *Fallen from Grace*.

Fallbacks remain quest-progression aware. ExileQuesting does not assume a vendor can provide a gem from future campaign progression merely because the universal vendor has been unlocked.

For Act-labelled PoB stages, a source proven available by the requested Act outranks a later free quest reward. Among equally verified sources, normal class sources still outrank detour fallbacks.

## Passive milestone intelligence

`assets/game-data/passive-tree-3.29.json` is a pinned snapshot generated from GGG's passive tree endpoint:

https://www.pathofexile.com/passive-skill-tree

The snapshot contains:

- schema version;
- PoE game version;
- generated-at timestamp;
- source URL;
- SHA-256 of the normalized node payload;
- passive node ID, name, and coarse node kind.

The initial 3.29 snapshot contains 3,389 named passive nodes, including 841 notable/keystone targets.

When moving from one aligned PoB tree stage to the next, ExileQuesting diffs allocated node IDs and turns high-value targets into readable names. If the imported PoB targets a different tree version, ExileQuesting keeps the safe allocation count but deliberately withholds current-tree names rather than risk mapping an old ID to the wrong node.

The snapshot is validated in Linux and Windows CI and in packaged startup smoke testing. `Refresh pinned passive data` provides a manual regeneration path, while the generator preserves `generatedAt` when the normalized tree is unchanged so refreshes are idempotent.

## Build-aware leveling loot filter

The loot filter is a **wrapper**, not a replacement for the player's existing filter.

The user selects an existing local `.filter` file. ExileQuesting writes `ExileQuesting.filter` beside it and never modifies the selected base file.

The generated wrapper places narrow build-aware rules first and ends with:

```text
Import "YourBaseFilter.filter"
```

Anything ExileQuesting does not explicitly match falls through to the player's normal NeverSink, FilterBlade, or other local filter rules.

### Rule priority

For the active PoB stage ExileQuesting currently emits:

1. campaign-scoped link setups with matching non-white colours, highlighted as a **quality bonus match**;
2. for 3-links and larger, a broader `LinkedSockets` rule so a fully usable white or mismatched-colour item is never missed;
3. linked RGB Chromatic Orb recipe candidates;
4. six-linked items as a high-value/special vendor-recipe case;
5. six-socket items as the non-six-linked Jeweller's Orb recipe case;
6. the selected base filter import.

Generated leveling rules include `AreaLevel <= 67`. This prevents ExileQuesting's intentionally broad campaign link rules from taking over endgame filtering after the campaign.

### Regeneration and reload state

The wrapper is regenerated when:

- a PoB is imported;
- the active Build Profile changes;
- the active Build Stage changes;
- the user explicitly requests regeneration;
- ExileQuesting starts with an already configured base filter.

A SHA-256 fingerprint prevents unchanged rules from being treated as a new filter. If the generated wrapper changes, the manager marks it as requiring a PoE filter reload. ExileQuesting does not synthesize keypresses or automate the game's UI to reload the filter.

## Campaign crafting intelligence

The semantic campaign layer now adds contextual crafting actions for:

- crafting recipes present in current campaign-area metadata when the route step does not already explain them;
- the PoE 3.29 Crafting Bench being available in every town from Act 2 onward;
- resistance preparation around Act 5 and Act 10 Kitava penalties.

Older campaign metadata still contains the removed `Socket Colours` recipe. That stale 3.28-era label is explicitly suppressed for 3.29 so it cannot become player-facing advice.

## What loot intelligence can know

The native filter language gives ExileQuesting reliable access to properties such as area level, socket count, link groups, socket colours, class/base type, rarity, identified state, explicit mods where the filter language permits them, and other documented filter conditions.

That is enough for useful build-aware leveling intelligence without reading game memory or automating gameplay.

## What it cannot know

ExileQuesting does **not** claim to know hidden properties that PoE does not expose to a normal companion workflow. In particular, this first layer does not:

- inspect every unidentified rare and infer its hidden affixes;
- read game memory;
- automatically pick up, vendor, craft, equip, or move items;
- inject input into PoE to reload filters;
- replace a full endgame economy filter;
- score manually copied rare gear against the build yet.

Rare-item parsing and gear scoring belong to the later Gear Coach work, where item text can be supplied explicitly by the player and evaluated deterministically.

## Safety and failure behavior

- the selected base filter must exist, be a regular `.filter` file, and stay below the configured size bound;
- `ExileQuesting.filter` cannot be selected as its own base;
- output is written through a temporary file before replacement;
- the player's base filter is covered by filesystem tests proving it is not modified;
- passive and gem resources are required by packaged startup smoke tests;
- malformed or version-mismatched passive data degrades to unnamed allocation counts rather than guessed node names;
- all generated loot rules are additive overrides followed by the user's base filter.
