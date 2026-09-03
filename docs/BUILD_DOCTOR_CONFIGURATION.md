# Build Doctor Configuration Doctor

## Purpose

Configuration Doctor separates Path of Building's configured peak state from conditions a character can realistically maintain while mapping, bossing, recovering from downtime, or entering combat cold.

The first deterministic availability primitive is an equipped-flask active-state toggle. It exists because flasks can materially change offence, mitigation, recovery and resistances, while their real uptime is not universal.

## Why flask availability first

Pinned Path of Building exposes `toggleFlask` through its reversible calculation override. PoB itself uses this path when comparing flask activation/deactivation effects. ExileQuesting therefore does not recreate flask mechanics or inject synthetic stats.

For an explicit `Flask 1` through `Flask 5` slot, the worker:

1. resolves the equipped PoB item;
2. verifies that it is a flask;
3. reads the imported slot's current active state;
4. cross-checks that state against PoB's active calculation environment when available;
5. recalculates with PoB's `toggleFlask` override;
6. returns complete normalized before/after states;
7. attaches an explicit `flask-active` transition with `fromActive` and `toActive`.

The imported build is never edited in place.

## State direction is part of the evidence

A numerical delta alone is ambiguous. If one calculation has 20% more armour, Build Doctor must know whether the perturbation activated a flask or removed one.

Every successful flask comparison therefore carries a transition such as:

`Flask 3: active -> inactive`

or:

`Flask 3: inactive -> active`

The mechanic graph refuses flask evidence when this transition metadata is missing or contradicts the requested slot.

## What deterministic sensitivity proves

The primitive can prove statements of the form:

- "With this imported flask state removed, pinned PoB calculates X less armour."
- "Activating this equipped flask changes these reviewed normalized outputs."
- "This build's configured result is sensitive to Flask 2 availability."

Those numerical statements are deterministic PoB evidence when parity succeeds.

Configuration Doctor normalizes either toggle direction into the same active contribution view. If the imported state is active, the result is a `configured-dependent` condition when reviewed metrics change. If the imported state is inactive but activation changes reviewed metrics, the result is `inactive-sensitive`. If none of the reviewed outputs change, the condition is `no-reviewed-impact` for the current normalized metric set.

The report preserves each scenario separately. A mapping calculation and sustained-boss calculation may show different numerical dependence on the same condition without either calculation being treated as uptime evidence.

## PoB flask profiles

Configuration Doctor also needs to know *what PoB itself calculated about the equipped flask* before any uptime interpretation is attempted.

The `inspect-flasks` worker operation exposes a bounded, read-only profile for the five equipped flask slots. It reads processed data directly from pinned PoB rather than parsing tooltip text or reconstructing item rules independently.

For each equipped flask the profile includes:

- slot, name, base name, rarity and imported active state;
- whether PoB classifies it as a life, mana or utility flask;
- processed local `flaskData` values where available:
  - duration;
  - maximum charges;
  - charges used;
  - local charge-gain modifier;
  - local flask-effect increase;
- build-level PoB modifier inputs relevant to flask duration, charge consumption, charge gain and effect;
- PoB modifier inputs for generated charges per second, including generic and life/mana/utility-specific sources;
- generated charges per empty flask slot;
- chance not to consume charges, capped at 100% as in the reviewed PoB path;
- Iron Flask charges generated on Ward Break.

The worker also reports the number of empty flask slots because PoB has mechanics whose generated-charge contribution depends on that count.

These are **inputs and processed PoB state, not a real-combat uptime claim**. The profile contract deliberately contains no `uptime`, `averageUptime`, `minimumUptime` or equivalent field.

### Why we expose inputs before uptime

Pinned PoB already contains a flask-uptime calculation path in `ItemsTab.lua`. It combines processed flask duration and charge cost with charge generation, charge-gain modifiers, chance not to consume charges and interval-aware minimum/average calculations.

ExileQuesting should review and parity-gate that exact upstream behavior before surfacing an uptime result. Reimplementing a similar-looking formula independently would create a second mechanics engine and undermine the Build Doctor evidence model.

The profile milestone therefore gives later Configuration Doctor work the verified ingredients while keeping the interpretation boundary intact.

## What deterministic sensitivity does not prove

A flask toggle or flask profile does not prove real combat uptime. Build Doctor must not infer that a flask is permanently available because the PoB checkbox is active, because charge-generation inputs exist, or because a flask has enough maximum charges for several uses.

PoB perturbation/calculation evidence is therefore not accepted as Configuration Doctor uptime evidence. Availability labels come from a separate reviewed evidence channel.

## Availability labels

The typed availability model supports these labels:

- `permanent`: structural availability supported throughout the relevant combat state;
- `mapping-credible`: evidence supports ordinary mapping availability;
- `boss-sustainable`: evidence supports sustained boss availability rather than only a short opener;
- `burst-only`: the condition is supported only for a limited burst window;
- `cold-start-unavailable`: the condition is not available immediately after entering combat or after a relevant resource drought;
- `unproven`: the default when no acceptable availability evidence exists.

Labels are intentionally not collapsed into one universal score. For example, `mapping-credible` and `cold-start-unavailable` can both be true. Likewise mapping and boss sustainability can both be independently supported.

The validator rejects logically conflicting claim sets such as:

- `permanent` plus `burst-only`;
- `permanent` plus `cold-start-unavailable`;
- `burst-only` plus `mapping-credible`;
- `burst-only` plus `boss-sustainable`.

If evidence disagrees in a way the current model cannot represent safely, the result fails closed rather than inventing a compromise.

## Accepted uptime evidence

The first availability-evidence allowlist accepts:

- `game-data`;
- `reviewed-rule`;
- `expert-source`.

Every claim requires:

- a stable evidence id;
- the exact condition node it applies to;
- one availability label;
- a confidence class;
- a non-empty source/provenance reference.

This is deliberately narrower than the mechanic graph's full evidence vocabulary. Raw PoB perturbation evidence can establish impact, but it cannot by itself establish mapping uptime, boss sustainability or cold-start behavior.

## Baseline-state consistency

A merged mechanic graph may contain the same condition evaluated under several scenarios. Configuration Doctor requires those comparisons to agree about the imported baseline state.

For example, if one fragment claims `Flask 2` started active while another fragment for the same character claims it started inactive, Configuration Doctor rejects the merged dependency rather than silently treating both as one character state.

Later scenario generation may intentionally create different explicit character states. Those should be represented as distinct reviewed scenario states rather than masquerading as one imported baseline.

## Parity

Flask availability and flask-profile inspection share a dedicated real-PoB parity gate in addition to the existing item/passive parity harness.

The independent reference process:

- loads the same pinned upstream PoB fixture directly;
- reads processed `item.flaskData` and the reviewed `mainEnv.modDB` inputs directly from PoB;
- records the number of empty flask slots;
- cross-checks imported slot activity against PoB's active calculation environment;
- independently selects a flask whose `toggleFlask` calculation changes at least one reviewed raw metric;
- records the baseline active state and opposite state;
- records raw before/after PoB outputs.

ExileQuesting independently performs `inspect-flasks` and the same slot toggle through its worker. CI compares every exposed profile field and the normalized before/after calculation states. At least one equipped flask and at least one measurable toggle must be exercised across the upstream fixtures or the dedicated gate fails instead of silently claiming coverage.

The worker adapter revision is part of provenance. Advancing the flask inspection contract to adapter `0.5.0` also advances the original base/item/passive parity harness to require `0.5.0`, so older deterministic primitives cannot silently run against a changed adapter.

## Mechanic graph integration

A flask perturbation creates a condition node such as:

`condition:flask-active:Flask 3`

and only `observed-response` edges to changed metrics. The graph preserves whether the condition moved from active to inactive or the reverse.

It does not automatically promote those observations to semantic claims like `requires` or `provides-uptime-for`. Those relationships need reviewed mechanic evidence.

Configuration Doctor consumes this graph and derives a typed dependency report without modifying the graph's evidence semantics. The numerical dependency remains deterministic PoB evidence; the availability classification remains a separate reviewed claim layer.

## Next steps

The next Configuration Doctor work should build on the parity-gated flask profile instead of recreating flask mechanics. Priorities include:

1. review and expose PoB's own average/minimum flask-uptime calculation with an independent parity oracle;
2. distinguish charge generation that depends on mapping kills, boss interactions, Ward Break or other situational events from unconditional generation;
3. feed only sufficiently supported character-specific results into the availability-evidence model;
4. add guard-skill available/unavailable defensive states;
5. add cold-start and low-resource scenario generation;
6. surface calculated impact, deterministic resource inputs and availability confidence separately in the UI.

Generic arbitrary configuration mutation remains disabled until a safe, parity-testable contract exists.
