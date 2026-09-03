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

## What this proves

The primitive can prove statements of the form:

- "With this imported flask state removed, pinned PoB calculates X less armour."
- "Activating this equipped flask changes these reviewed normalized outputs."
- "This build's configured result is sensitive to Flask 2 availability."

Those numerical statements are deterministic PoB evidence when parity succeeds.

## What this does not prove

A flask toggle does not prove real combat uptime. Build Doctor must not infer that a flask is permanently available because the PoB checkbox is active.

Future Configuration Doctor classification will distinguish evidence-backed categories such as:

- permanent / structural;
- credible normal mapping uptime;
- sustainable boss uptime;
- burst-only;
- unavailable after a cold start or resource drought;
- unproven.

Those labels require build mechanics, flask charge generation/consumption, content context and reviewed evidence. The current primitive supplies the deterministic counterfactual needed for that later reasoning.

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

## Next steps

After flask availability is parity-gated, Configuration Doctor should expand through similarly reversible, evidence-backed state changes. Candidate seams include reviewed PoB conditions where both baseline state and direction can be proven, plus guard/flask-unavailable defensive scenarios.

Generic arbitrary configuration mutation remains disabled until a safe, parity-testable contract exists.
