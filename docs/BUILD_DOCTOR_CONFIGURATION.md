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

## What deterministic sensitivity does not prove

A flask toggle does not prove real combat uptime. Build Doctor must not infer that a flask is permanently available because the PoB checkbox is active.

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

Flask availability has its own real-PoB parity oracle in addition to the existing item/passive parity harness.

The independent reference process:

- loads the same pinned upstream PoB fixture directly;
- scans equipped flask slots;
- selects a flask whose `toggleFlask` calculation changes at least one reviewed raw metric;
- records the baseline active state and opposite state;
- records raw before/after PoB outputs.

ExileQuesting independently performs the same slot toggle through its worker. CI compares normalized states and requires the worker's explicit state transition to match the reference. At least one upstream fixture must exercise a measurable flask toggle or the dedicated parity gate fails instead of silently claiming coverage.

## Mechanic graph integration

A flask perturbation creates a condition node such as:

`condition:flask-active:Flask 3`

and only `observed-response` edges to changed metrics. The graph preserves whether the condition moved from active to inactive or the reverse.

It does not automatically promote those observations to semantic claims like `requires` or `provides-uptime-for`. Those relationships need reviewed mechanic evidence.

Configuration Doctor consumes this graph and derives a typed dependency report without modifying the graph's evidence semantics. The numerical dependency remains deterministic PoB evidence; the availability classification remains a separate reviewed claim layer.

## Next steps

The next Configuration Doctor work should begin feeding real reviewed mechanic evidence into the availability model and expand through similarly reversible, evidence-backed state changes. Priorities include:

1. flask charge generation and consumption evidence for mapping/boss sustainability;
2. guard-skill available/unavailable defensive states;
3. reviewed PoB conditions where both baseline state and transition direction can be proven;
4. cold-start and low-resource scenario generation;
5. UI surfacing that shows calculated impact separately from availability confidence.

Generic arbitrary configuration mutation remains disabled until a safe, parity-testable contract exists.
