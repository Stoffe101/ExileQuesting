# Build Doctor sensitivity analysis

## Purpose

Build Doctor must learn how the **actual imported build** responds to controlled changes instead of assigning universal stat weights. The pinned Path of Building calculation kernel remains authoritative for numerical outcomes; ExileQuesting only derives structured comparisons from those measured states.

The first merged primitive supports one reversible equipment replacement. The response-surface layer can then turn sequences of real PoB recalculations into local sensitivity curves and conservative breakpoint candidates.

## Current boundary

`src/core/pob-sensitivity.ts` accepts an ordered or unordered set of already-calculated PoB states, an explicit numeric axis and one reviewed output metric. It then:

- sorts samples by axis value;
- keeps each sample tied to its PoB request id;
- derives normalized per-segment slopes even when sample spacing is uneven;
- reports plateau onset/exit candidates;
- reports direction-change candidates;
- reports large adjacent slope-change candidates using an explicit threshold;
- fails closed on duplicate axis values, unavailable metrics, non-finite inputs and oversized sample sets.

This layer performs **no PoE mechanics simulation of its own**.

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

## Enabled perturbations

The worker still accepts exactly one perturbation per request. Two perturbation families are now enabled:

1. `replace-item` uses PoB's own `Item` parser, slot validation and reversible `{ repSlotName, repItem }` calculator override.
2. `passive-node` resolves one real PoB node and uses the same reversible calculator with either `addNodes` or `removeNodes`.

The passive operation is validated against the imported state: allocating an already allocated node and deallocating an unallocated node fail closed. The worker does not edit `build.spec`, so the imported build remains unchanged.

### Passive-node interpretation boundary

Single-node allocation is a **sensitivity experiment**, not automatically a legal passive-tree recommendation. The calculator can measure what an adjacent unallocated node would do, but Build Doctor must later solve pathing, point cost, refunds, mastery/cluster interactions and whole-build constraints before recommending a transition.

Likewise, removing one node measures dependency on that node. It does not by itself prove that the node can be refunded without disconnecting downstream allocations.

The independent parity oracle deliberately chooses:

- a currently allocated node whose removal changes at least one reviewed metric; and
- an adjacent currently unallocated node whose addition changes at least one reviewed metric.

For both directions, the reference process calls raw pinned PoB `GetMiscCalculator()` independently. CI compares ExileQuesting's normalized before/after states to those raw results on every parity fixture.

## Contract hardening

Renderer-safe request validation and the Lua adapter expose the same capability set. Unsupported synthetic-stat, gem and configuration perturbations remain protocol design placeholders and are rejected until each has a real PoB-backed implementation plus independent parity coverage.

## Next engineering step

Use these verified item and passive primitives to begin **mechanic graph extraction** and dependency experiments. In parallel, identify the first clean scalar configuration input that PoB can vary reversibly so the response-surface analyzer can consume real multi-sample sweeps rather than synthetic fixtures. Mechanic-specific breakpoint claims remain blocked until a candidate curve can be tied to reviewed PoB/game evidence.
