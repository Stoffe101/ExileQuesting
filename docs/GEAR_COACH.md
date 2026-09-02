# Gear Coach

Gear Coach is the v0.2 bridge between a build guide and the pile of items actually dropping on the floor.

Its job is intentionally narrow: answer **“is this visible item useful for my active leveling build right now?”** without pretending ExileQuesting can inspect hidden game state.

## Fast workflow

1. Hover an item in Path of Exile.
2. Press `Ctrl+C` so the game copies its public item text.
3. In ExileQuesting, open Build Planner → Gear Coach.
4. Click **Analyze copied item**.

The clipboard is read only after that explicit button press. ExileQuesting does not watch the clipboard continuously, move the mouse, press keys, equip gear or automate gameplay.

A normal paste-text box is also available for troubleshooting or comparing an item copied earlier.

## What is parsed

The local parser reads visible Path of Exile item-copy text and can retain:

- item class, rarity, name and base type;
- gear slot;
- item level and equip-level/attribute requirements;
- socket count and maximum linked group;
- corruption, mirrored and unidentified state;
- maximum Life and Mana;
- elemental and Chaos resistance modifiers;
- Strength, Dexterity, Intelligence and all-attribute modifiers;
- movement, attack and cast speed;
- obvious increased-damage and gem-level modifiers;
- local Armour, Evasion, Energy Shield and Ward values.

Input is bounded before parsing. Malformed or empty item text produces an explicit error rather than a fabricated score.

## Build-stage evidence

Gear Coach is not a generic rare-item tier list. Its strongest signals come from the active Build Profile.

### Path of Building

v0.2 parses equipment inside named PoB item stages. When a stage references an item from PoB's shared item catalogue, ExileQuesting resolves the slot and parses that item into the same local model used for copied game items.

This allows Gear Coach to recognise evidence such as:

- the exact unique the PoB expects;
- the same base type as the stage target;
- comparable Life/resistance/movement/link values;
- the slot the target belongs to.

Empty/self-closing PoB item stages remain valid stages. The parser does not drop a stage merely because it contains no equipment entries.

### Maxroll

Maxroll equipment milestones already preserve slot/item/base/unique references. When Maxroll supplies a real friendly item name, Gear Coach can recognise an exact named target. Internal Maxroll identifiers are not presented as player-facing item names.

## Score and verdict

The 0–100 score is a campaign-oriented heuristic, not a simulator DPS result.

Depending on the slot and active stage, it considers:

- exact guide-target or base match;
- maximum Life;
- elemental resistance value;
- useful attributes;
- movement speed on boots;
- local defences on armour;
- obvious damage/attack-speed/cast-speed/gem-level signals on weapons;
- active main-skill link requirement;
- whether the detected character can equip the item yet.

The resulting verdict is one of:

- **Equip-worthy**: unusually strong fit for the current stage;
- **Good fit**: several strong current-build signals;
- **Situational**: useful if it repairs a current gap;
- **Low priority**: weak evidence for the active stage;
- **Save for later**: promising, but above the detected character level.

The explanation list matters more than the raw number. It shows which signals actually moved the score.

## Cheap repair advice

Gear Coach may recommend low-risk campaign repairs such as:

- crafting maximum Life if a usable item appears to need a prefix;
- crafting a missing elemental resistance if it appears to need a suffix;
- treating boots without movement speed as temporary.

These are explicitly conditional suggestions. Copied item text does not always prove whether the relevant affix slot is open, so the wording says **“if an open prefix/suffix is available”** instead of claiming a craft is guaranteed.

Corrupted items do not receive normal Crafting Bench repair recommendations.

## LOOK FOR guidance

The same build-stage information powers the manager, overlay and generated leveling filter.

The current LOOK FOR list can include:

- exact PoB stage uniques;
- stage-specific base types;
- Maxroll named equipment targets;
- the current main-skill link count;
- rough campaign Life/resistance expectations;
- movement-speed targets for boots.

The BUILD overlay shows only the highest-priority concise LOOK FOR hint. The manager carries the richer list.

## Build-aware loot filter

When the selected PoB stage exposes gear targets, the generated `ExileQuesting.filter` can highlight those bases before falling through to the player's existing filter.

The wrapper still remains intentionally narrow:

- campaign-scoped to `AreaLevel <= 67`;
- exact target base rules before link rules;
- PoE 3.29 link-count-first socket semantics;
- original base filter imported at the end;
- original filter file is never modified.

A target base highlight is a **build relevance hint**, not proof that every rare on that base is an upgrade.

## Limits Gear Coach does not cross

Gear Coach does **not**:

- know unidentified hidden affixes;
- inspect the player's currently equipped item automatically;
- calculate exact PoB DPS from arbitrary copied gear;
- know whether a rare has an open prefix/suffix with perfect certainty from every copy-text form;
- click, equip, craft or vendor anything;
- simulate input into Path of Exile.

Those boundaries are deliberate. The feature is meant to make visible information easier to act on, not invent game state that the client did not expose.

## Future extension

A later Gear/Crafting Coach can build on the same item model with a versioned local item/mod dataset, exact affix classification, richer build weights, budget-aware crafting and optional manually supplied current-equipment comparisons. v0.2 establishes the safe parsing, build-stage targeting and player-facing workflow first.
