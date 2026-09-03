# Mobalytics PoE1 guide support

Mobalytics is treated as a useful PoE1 build source, but its current public-access behavior requires a different integration boundary from Maxroll.

## What current Mobalytics PoE1 builds expose

Current PoE1 build pages and planner UX support the same families ExileQuesting cares about during leveling:

- build variants / progression checkpoints;
- Path of Building integration;
- passive trees;
- skills and gem groups;
- equipment sets;
- build notes and guide sections.

Independent implementation research also confirms that PoE1 build documents can carry a complete `pobCode` plus structured `buildVariants`. Variant data can contain passive-tree selections, equipment slots and skill-gem groups.

ExileQuesting's pure parser understands those embedded shapes without evaluating page JavaScript.

## Why direct URL import is not enabled

Mobalytics currently returns HTTP 403 to ExileQuesting's non-browser GitHub Actions probes, including direct known PoE1 build URLs. Changing only ordinary browser request headers does not make that a dependable application API.

ExileQuesting therefore does **not** ship a direct background Mobalytics scraper or pretend that paste-a-URL import is reliable.

If a Mobalytics build URL reaches the generic PoB import service, it is recognized before generic parsing and the player receives an actionable explanation instead of an opaque invalid-PoB error.

## Supported workflow today

Use the stable interchange format that Mobalytics already exposes to players:

1. Open the Mobalytics build in the browser.
2. Copy its Path of Building export or POBb.in link/code.
3. Paste that into ExileQuesting's Build Planner.
4. ExileQuesting processes it through the same hardened PoB pipeline used for native PoB builds.

That preserves all the downstream features that can be derived from the build:

- staged passive/skill/item sets when represented by the PoB;
- gem acquisition planning;
- Passive Tree HUD;
- Gear Coach;
- vendor search;
- build-aware loot intelligence;
- campaign build prompts.

The source-site URL is not required for those systems to function.

## Embedded-state parser

`src/core/mobalytics.ts` provides a bounded, non-network parser for future compatibility and deterministic fixtures.

It can:

- validate the current public PoE1 build URL families;
- extract `window.__PRELOADED_STATE__` without executing script;
- locate nested PoE1 build documents;
- extract the complete `pobCode` when present;
- normalize bounded build variants;
- read passive node IDs from main/Ascendancy/alternate trees;
- read skill groups and gem names;
- read equipment slot/name/base/rarity metadata.

The parser is deliberately bounded by URL length, state size, recursion depth, variant count, passive count, skill-group/gem count and equipment-slot count.

## Future direct-import rule

Direct Mobalytics URL import should be enabled only if one of these becomes true:

- Mobalytics publishes a documented/stable public build API; or
- normal public build pages become reliably accessible to application clients without bypassing an access-control system.

If that happens, ExileQuesting should prefer extracting the embedded complete `pobCode` and feeding it into the existing PoB parser. Structured variants are valuable supplementary metadata, but reconstructing a PoB from them should be a fallback, not the first choice.

## Monitoring

The scheduled companion upstream monitor probes a known public Mobalytics PoE1 build.

Current expected state is HTTP 403, which is informational and does not create release failures. If the behavior becomes HTTP 200, the monitor immediately attempts the deterministic embedded-state parser and opens a compatibility-review issue so direct import can be reconsidered.

Mobalytics availability can never block normal ExileQuesting CI, packaging or updates.
