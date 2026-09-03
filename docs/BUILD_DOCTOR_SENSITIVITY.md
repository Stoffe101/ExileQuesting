# Build Doctor sensitivity analysis

## Purpose

Build Doctor must learn how the **actual imported build** responds to controlled changes instead of assigning universal stat weights. The pinned Path of Building calculation kernel remains authoritative for numerical outcomes; ExileQuesting only derives structured comparisons from those measured states.

The first merged primitive supports one reversible equipment replacement. The breakpoint-analysis layer turns sequences of PoB recalculations into local response surfaces. The next primitive adds reversible single-node passive allocation/deallocation so Build Doctor can measure passive-tree marginal effects with the same deterministic calculation boundary.

## Current boundary

`src/core/pob-sensitivity.ts` accepts an ordered or unordered set of already-calculated PoB states, an explicit numeric axis and one reviewed output metric. It then:

- sorts samples by axis value;
- keeps each sample tied to its PoB request id;
- derives normalized per-segment slopes even when sample spacing is uneven;
- reports plateau onset/exit candidates;
- reports direction-change candidates;
- reports large adjacent slope-change candidates using an explicit threshold;
- fails closed on duplicate axis values, unavailable metrics, non-finite inputs and oversized sample sets.

The calculation worker currently enables exactly one perturbation per request from this reviewed set:

- `replace-item` for bounded core equipment slots;
- `passive-node` with `allocate` or `deallocate` for one ordinary passive node.

This layer performs **no PoE mechanics simulation of its own**.

## Passive-node sensitivity

Passive sensitivity uses Path of Building's own reversible miscellaneous calculator override with `addNodes` or `removeNodes`. The imported PoB tree is not edited in place.

The first boundary deliberately excludes node classes that need extra semantics before they can be interpreted safely:

- class starts and ascendancy class starts;
- mastery selectors, because the chosen mastery effect is additional state;
- jewel sockets, because socket allocation and jewel state are coupled;
- proxy nodes.

The worker also verifies state consistency. An allocation request fails if the node is already allocated, and a deallocation request fails if the node is not allocated.

A passive-node result is a **marginal calculation**, not a legal-tree recommendation. It answers what PoB calculates when that one node is added or removed from the current state. It does not yet prove that an unallocated node is reachable for one passive point or that removing an allocated node leaves a connected legal tree. Path legality belongs to the later whole-build transition optimizer.

The parity harness independently asks pinned PoB to choose ordinary allocated and unallocated nodes with measurable effects, calculates them directly through PoB's own `CalcOverride`, then verifies ExileQuesting's normalized before/after states for both allocation and deallocation.

## Breakpoint terminology

A detected discontinuity is deliberately called a **breakpoint candidate**, not a verified game breakpoint.

For example, a flat effective-trigger-rate response after one sample may be consistent with a trigger cap, cooldown breakpoint or another discrete mechanic, but the numeric shape alone does not prove which mechanic caused it. Later mechanic-graph logic must attach the relevant PoB/game evidence before Build Doctor presents a mechanic-specific explanation.

Candidate evidence is therefore labelled `derived-candidate`.

## Default detection rules

The defaults are intentionally conservative and transparent:

- maximum 64 samples per sweep;
- a segment is treated as flat only when its relative metric change is at most `1e-6`;
- adjacent non-flat slopes need a magnitude ratio of at least `4x` before a generic slope-change candidate is emitted;
- sign changes are represented separately from magnitude changes;
- plateaus are represented separately from generic slope changes.

These thresholds are analysis controls, not Path of Exile balance facts. Callers can provide stricter reviewed thresholds for a specific experiment.

## Enabled metrics

The first analyzer exposes reviewed normalized outputs already present in the calculation protocol:

- total DPS;
- effective trigger rate;
- speed;
- critical strike chance;
- effective hit pool;
- physical/fire/cold/lightning/chaos maximum hit.

Additional axes or outputs should only be added after their PoB normalization and parity behavior are understood.

## Contract hardening

The TypeScript request validator is kept aligned with the actual Lua worker capability. `calculate-with-perturbations` accepts **exactly one** enabled perturbation. Unsupported synthetic-stat, gem and configuration placeholders remain rejected before worker execution until each has a real PoB-backed implementation and parity coverage.

Passive node ids are required to be positive safe integers within the worker's explicit bound before they cross the process boundary.

## Next engineering step

Use these deterministic discrete primitives to start extracting mechanic relationships and configuration dependencies. Scalar sweeps should only be added where pinned PoB exposes a reversible calculation input that can be independently parity-tested; curve shape alone must never be promoted into a mechanic claim.
