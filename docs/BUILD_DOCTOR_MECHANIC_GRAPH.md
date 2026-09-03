# Build Doctor mechanic graph

## Goal

Build Doctor needs a machine-readable model of why a build works without promoting every numerical correlation into a Path of Exile mechanic claim.

The mechanic graph is therefore **evidence first**. Its first job is to preserve deterministic observations from the pinned Path of Building kernel in a structure that later reviewed mechanic logic can enrich.

## Graph layers

The graph supports nodes for:

- skills and supports;
- items and passives;
- resources and conditions;
- breakpoints;
- defences and scaling axes;
- content modifiers;
- normalized PoB observables.

It supports semantic relationships such as `scales`, `enables`, `converts`, `triggers`, `requires`, `caps`, `conflicts-with`, `provides-uptime-for` and `protects-against`.

Those semantic relationships are **not** emitted automatically from raw numerical deltas.

The deterministic extractor introduced in this milestone emits only `observed-response` edges. For example:

`Passive node 42001 -> observed-response -> Total DPS`

with attached evidence showing the exact before/after PoB values and the perturbation that produced them.

That is intentionally weaker than claiming:

`Passive node 42001 -> scales -> Critical damage`

The latter requires mechanic interpretation from reviewed PoB/game data or expert evidence.

## PoB perturbation evidence

`graphFromPobPerturbation()` accepts one complete before/after perturbation comparison from the pinned calculation kernel.

It verifies:

- exactly one perturbation is present;
- before/after request IDs match;
- PoB commit, runtime revision, protocol version and adapter version match;
- before/after scenario configuration matches.

The first supported evidence sources are the already parity-gated perturbations:

- item replacement;
- passive-node allocation/deallocation.

Unsupported placeholder perturbations fail closed.

## Privacy / corpus hygiene

Candidate item text is deliberately **not stored** in graph evidence. The graph records the replacement slot and request identity, but not the copied item text. This keeps the mechanic layer focused on normalized evidence and avoids turning arbitrary copied input into long-lived graph data.

## Observables

The first extractor records changed reviewed outputs including:

- total DPS;
- speed and effective trigger rate;
- crit and hit chance;
- life, Energy Shield, mana and ward;
- effective hit pool;
- armour, evasion, suppression and block;
- elemental/chaos resistances;
- physical/elemental/chaos maximum hit;
- total net recovery and degeneration.

An unchanged output does not create an edge.

The direction is recorded as an increase or decrease, but the graph does not call that change "good" or "bad". That judgement depends on build intent, content and constraints.

## Multiple scenarios

Graph fragments can be merged. Repeating the same perturbation source against mapping, sustained-boss or other reviewed scenarios attaches multiple evidence records and observations to the same relationship rather than overwriting earlier evidence.

This is important for Configuration Doctor. A passive or item may look important in one scenario and irrelevant in another, and the graph must preserve that disagreement rather than flattening it into one universal weight.

## Validation

The graph validator rejects:

- duplicate node, edge or evidence IDs;
- dangling edges;
- edges with no evidence;
- observations whose evidence is not attached to the edge;
- non-finite numerical observations;
- internally inconsistent increase/decrease directions;
- unsupported schema kinds.

Graph merging also rejects conflicting definitions that reuse the same stable ID for different content.

## Confidence

Numerical observations produced by the pinned PoB perturbation kernel are stored as `verified` evidence because the number itself is deterministic and parity-gated.

That does **not** make the causal interpretation verified. The `observed-response` relationship exists specifically to keep those two ideas separate.

Later reviewed enrichment may promote a relationship to `high` confidence when a PoB mechanic, documented game rule or corroborated expert source explains the observation. Unusual or incomplete relationships should remain `medium` or `experimental` as appropriate.

## Next step

Use this evidence graph to begin dependency extraction around conditions, enabling uniques/passives, trigger mechanics, resources and defensive layers. Configuration Doctor should then compare scenario states and identify which conditions are permanent, mapping-credible, boss-sustainable, burst-only or unproven.

No semantic edge should be promoted merely because a numerical perturbation changed an output.
