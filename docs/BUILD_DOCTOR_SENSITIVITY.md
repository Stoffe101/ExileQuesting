# Build Doctor sensitivity analysis

## Purpose

Build Doctor must learn how the **actual imported build** responds to controlled changes instead of assigning universal stat weights. The pinned Path of Building calculation kernel remains authoritative for numerical outcomes; ExileQuesting only derives structured comparisons from those measured states.

The first merged primitive supports one reversible equipment replacement. This follow-up adds the analysis layer needed to turn a sequence of PoB recalculations into a local response surface.

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

## Contract hardening in this milestone

The TypeScript request validator now matches the actual Lua worker capability: `calculate-with-perturbations` accepts **exactly one** currently enabled `replace-item` perturbation. A single `synthetic-stat`, gem, passive or configuration perturbation is rejected before reaching the worker instead of being mistakenly accepted by the TypeScript boundary and rejected later by Lua.

Those perturbation types remain protocol design placeholders until each one has a real PoB-backed implementation and parity coverage.

## Next engineering step

Build the first controlled scalar sweep against the pinned PoB worker. The preferred first target is a mechanic where upstream PoB exposes a reversible calculator input cleanly and where an independent reference oracle can verify every sampled state. Once that is proven, feed the measured states into this analyzer and add mechanic-specific breakpoint confirmation rather than inferring causes from curve shape alone.
