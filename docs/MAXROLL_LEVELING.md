# Maxroll leveling guide support

ExileQuesting treats a Maxroll Path of Exile leveling guide as a first-class build source alongside Path of Building. The integration is designed to answer the player's immediate question: **what should I change next while leveling?**

## Supported source

The importer accepts public PoE guide URLs in this form:

```text
https://maxroll.gg/poe/build-guides/<guide-slug>
```

It does not accept arbitrary Maxroll pages, backend URLs, planner URLs as user input, or non-HTTPS redirects.

For a guide import, ExileQuesting fetches bounded public HTML from the allowlisted Maxroll host, reads the page's embedded Remix state, discovers the referenced PoE planner, then fetches that planner from the public `/poe/planner/<id>` route. The application does not bundle or re-publish Maxroll article prose.

## Corpus audit

The September 2026 audit discovered 109 current public PoE build-guide routes, parsed 106 and identified 103 with leveling-relevant signals. The three non-parsing routes were category/index-style pages rather than ordinary build planners.

The corpus covered dedicated class leveling guides, league starters with leveling progression and the class Twink family. Ten pages carried a Twink signal; the canonical class Twink set covers Duelist, Marauder, Ranger, Scion, Shadow, Templar and Witch.

The audit is summarized in `LEVELING_GUIDE_AUDIT.md`. The permanent scheduled monitor uses representative normal and Twink contracts rather than repeatedly fetching the entire guide corpus.

## Normal leveling guides

Current Maxroll PoE1 planners can expose several useful structured families:

- level-labelled skill/gem stages;
- ordered passive-tree history;
- refunds between passive checkpoints;
- ascendancy/class metadata;
- alternate skill paths when the planner contains them;
- equipment sets when the planner contains them.

The Explosive Concoction Deadeye guide used as the normal live contract currently exposes six skill ranges from `Level 1 - 12` through `Level 38+` and an ordered passive history with both additions and refunds.

## Twink leveling guides

Twink articles can use an older-looking backend embed URL inside the article rather than a visible modern planner link. ExileQuesting resolves the planner identifier from that public embed reference and reads the corresponding public Maxroll planner page.

The Ranger Twink guide used as the Twink live contract currently exposes:

- staged skills at levels 2, 4, 10, 12, 16, 18 and 24;
- a named `Hollow Palm Swap (Level 12)` stage;
- a Ranger passive allocation stream;
- several equipment sets, including an Act 1 setup.

Maxroll uses a different passive-history shape for this Twink planner than for the normal guide. The adapter normalizes both forms into the same ExileQuesting passive-operation stream.

## Canonical gem identities

Maxroll planner data sometimes exposes a metadata-derived label such as `Support Volley` rather than the game-facing name `Volley Support`. ExileQuesting must not propagate those implementation labels into the player experience.

After parsing a Maxroll planner, every gem is resolved against the bundled, version-pinned PoE gem snapshot. When a unique match exists, ExileQuesting replaces the planner label and abbreviated skill ID with the canonical current gem name and full metadata ID.

That normalized build is then used by all downstream systems:

- active skill/gem stage display;
- quest and vendor acquisition planning;
- Siosa/Lilly fallback logic;
- link and loot-filter targets;
- manager Build Intelligence;
- the BUILD overlay.

If a gem cannot be resolved uniquely, the original Maxroll value is retained and the normal unknown-gem safeguards remain active rather than guessing.

## Twink equipment provenance

Maxroll does not consistently expose a friendly display name for every item in its Twink equipment sets. It does, however, expose stable structured references for each slot.

ExileQuesting therefore persists, when available:

- equipment slot;
- Maxroll planner item ID;
- friendly item name;
- PoE base metadata ID;
- Maxroll/PoE unique metadata ID.

An internal identifier is never presented as though it were the item's real player-facing name. This preserves enough provenance for Gear Coach/item-data improvements without another article-scraping layer.

## Two progression clocks

Skill progression and passive progression are intentionally not advanced by the same rule.

### Skills and gems

Client.txt character-level events may safely move the active Maxroll skill stage to the highest level milestone that has been reached. For example, reaching level 12 can activate a `Level 12` or `Hollow Palm Swap (Level 12)` skill stage automatically.

The active stage then feeds the existing ExileQuesting gem-acquisition planner, vendor/quest lookup, loot-link targets and BUILD overlay.

### Passives

Character level is **not** treated as passive-point count. Quest passive rewards, refunds and different completion order make that unsafe.

Instead, each Maxroll profile keeps an explicit passive cursor. The overlay can show one exact operation at a time:

```text
NEXT PASSIVE
Precise Technique
keystone · step 19/93
[Taken ✓]
```

or:

```text
REFUND PASSIVE
Field Medicine
[Refunded ✓]
```

The cursor advances only when the player acknowledges the operation. The manager also provides a Back control for correction. Both the Maxroll profile and the passive cursor are persisted, so restarting ExileQuesting does not reset progression.

## Passive-tree compatibility

A Maxroll article can be current while its embedded planner still declares an older passive-tree version. ExileQuesting does not assume that an old planner version is safe merely because its page was recently edited.

At import time, every referenced Maxroll passive node ID is checked against the bundled, version-pinned current PoE passive snapshot.

Compatibility states:

- `current`: planner tree version matches the bundled game tree and referenced IDs resolve;
- `compatible-ids`: planner declares an older tree, but every referenced node ID still exists in the current bundled tree;
- `stale`: one or more referenced IDs no longer exist, or current passive data is unavailable;
- `guide-only`: no structured passive path was exposed.

Exact passive coaching is enabled only for `current` and `compatible-ids`. A `compatible-ids` profile keeps a visible warning and displays node names from the current bundled snapshot rather than trusting stale names.

## Reusable guide knowledge

The broad corpus audit repeatedly reinforced several concerns that ExileQuesting now handles as product systems rather than copied guide text:

- vendor checks and current vendor regex;
- movement-speed boots;
- linked gear;
- gem acquisition and build swaps;
- Siosa/Lilly gem checkpoints;
- resistance recovery around Kitava;
- crafting-bench progression;
- build-aware loot filters;
- Lab/Ascendancy milestones when represented by the imported build;
- waypoint/portal/relog route efficiency from campaign routing data.

Build-specific damage rotations, temporary economy advice and author-specific farming recommendations are intentionally not generalized unless the structured build itself provides the underlying fact.

## Failure and schema-change behavior

Maxroll is an external source whose page/planner schema can change independently of ExileQuesting. Therefore:

- guide and planner responses are byte-bounded and time-bounded;
- final redirects are revalidated against narrow Maxroll paths;
- malformed or missing structured planner state causes an explicit import error;
- passive operations, equipment milestones and skill stages are bounded before persistence;
- persisted Maxroll metadata is normalized on load;
- a Maxroll failure must not corrupt existing PoB profiles or campaign data.

Permanent release CI relies on deterministic fixtures so a Maxroll outage cannot block an otherwise valid release.

Separately, `.github/workflows/companion-upstream-monitor.yml` probes a normal and a Twink public contract every twelve hours. A meaningful contract drift opens a deduplicated compatibility-review issue. It never modifies production data automatically.

## Policy boundary

The integration remains advisory. ExileQuesting may tell the player which gem, gear transition or passive comes next, but it does not allocate a passive, equip an item, press keys, click the game client, or otherwise automate gameplay.
