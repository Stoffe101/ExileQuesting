# Path of Building calculation kernel spike

## Status

Feasibility is **confirmed enough to proceed to an isolated prototype**.

Research pin for this spike:

- repository: `PathOfBuildingCommunity/PathOfBuilding`
- branch reviewed: `dev`
- commit: `ed354c2f8c42e148bc904c7508dbe851fb2cf952`
- reviewed: 2026-09-03

This pin is research evidence, not yet a redistributed dependency.

## Upstream headless seam

Current Path of Building Community includes `src/HeadlessWrapper.lua`.

The wrapper states that it allows PoB to run headless and can run under a standard Lua interpreter, with LuaJIT preferred. It stubs the graphical host, initializes PoB, then exposes the active build module as `build`.

Important helpers already provided upstream:

```lua
function loadBuildFromXML(xmlText, name)
    __mainObject__.main:SetMode("BUILD", false, name or "", xmlText)
    runCallback("OnFrame")
end

function loadBuildFromJSON(characterJSON)
    -- imports items/skills/passive tree/jewels
end
```

The upstream comment for `loadBuildFromJSON` explicitly calls out the documented GGG character API response as an example input. That is especially useful for the planned optional OAuth-linked character snapshot.

PoB's own `spec/GenerateBuilds.lua` demonstrates the calculation-output path:

1. load an XML build through `loadBuildFromXML`;
2. read `build.calcsTab.mainOutput`;
3. serialize selected output fields for regression fixtures.

PoB CI also executes the headless wrapper with LuaJIT, so this path is not merely dead documentation.

## Why XML is the preferred worker input

PoB's rundown notes that a generic standalone user of `HeadlessWrapper.lua` would need `Deflate()`/`Inflate()` to import/export compressed share codes.

ExileQuesting already performs bounded PoB export-code decompression and XML parsing in TypeScript. The calculation worker therefore does not need to own network access or compressed-code parsing in its first version.

Preferred boundary:

```text
pobb.in / export code / local XML
        |
        v
ExileQuesting hardened importer
        |
        v
normalized validated PoB XML
        |
        v
isolated headless PoB worker
        |
        v
normalized calculation result
```

This keeps remote fetching, input bounds and URL policy in the existing Electron/TypeScript security boundary.

## Worker process design

The PoB kernel should not execute in the Electron renderer or main process.

Proposed process boundary:

- a dedicated child process starts a pinned LuaJIT + pinned PoB runtime;
- stdin/stdout use newline-delimited JSON or length-prefixed JSON messages;
- the worker receives XML plus an explicit operation;
- no arbitrary Lua source is accepted from the UI;
- no network access is required for normal calculations;
- request and response size/time bounds are enforced by the Node parent;
- the worker can be killed and restarted independently after timeout/crash;
- all raw PoB output stays behind a normalization layer so upstream field churn does not leak across the application.

The initial operations should be deliberately narrow:

1. `load-and-calculate`
2. `calculate-with-overrides`
3. `describe-configuration`
4. `health`

Mutation/upgrade operations should be added only after the base-output parity gate is trustworthy.

## Normalized output contract

Do not make the rest of ExileQuesting depend directly on every key in `build.calcsTab.mainOutput`.

The worker adapter should normalize a reviewed subset into stable domains:

### Offence

- selected main skill/skill part;
- hit DPS;
- combined/full DPS where meaningful;
- DoT/ailment components;
- hit rate / attack or cast rate;
- crit chance/multiplier where relevant;
- damage-type composition;
- penetration/resistance state where available;
- trigger/cooldown state where available.

### Defence

- life / ES / relevant mana pool;
- EHP-style output;
- physical/fire/cold/lightning/chaos maximum-hit outputs;
- armour/evasion;
- suppression;
- block/spell block;
- max resistances;
- recovery/regen/leech outputs that can be verified;
- guard/flask/configuration-dependent state markers.

### Requirements/configuration

- enabled main skill and supports;
- active configuration flags relevant to the result;
- warnings/missing requirements;
- calculation-version pin.

Field mapping must be fixture-tested against the pinned PoB commit.

## Parity gate

Before Build Doctor consumes PoB numbers, the worker must reproduce PoB results for a mechanically diverse fixture set.

Early parity cases should include at minimum:

- direct-hit crit projectile attack;
- non-ailment DoT;
- ignite/poison ailment;
- minion;
- trigger/CoC-style case;
- charge/attribute/resource stacker;
- armour-heavy defence;
- evasion/suppression defence;
- ES/CI-style defence;
- block/max-res/recovery-heavy defence.

The fixture comparison should tolerate only explicitly documented formatting/rounding differences. A changed upstream PoB commit must rerun parity before becoming the new pin.

## Sensitivity / perturbation phase

Once base parity passes, controlled mutations can be added. Each mutation produces a before/after calculation result and a provenance record.

Examples:

- add a bounded synthetic stat modifier;
- disable/replace a support gem;
- replace an item;
- add/remove a passive node;
- change a configuration condition;
- change an attack/cast/trigger-rate input;
- add/remove defence layers.

Sensitivity results should include both the numerical delta and whether the change crosses a discontinuity/cap/breakpoint.

The first purpose is not “find the best build automatically”. It is to establish experimentally what the current build actually responds to.

## Configuration Doctor dependency

PoB can produce mathematically valid output for unrealistic condition combinations. ExileQuesting must therefore preserve the configuration inputs that produced every calculation.

A later Configuration Doctor will classify conditions into states such as:

- permanent;
- normal mapping uptime;
- sustained boss uptime;
- burst-only;
- conditional/unproven.

The kernel must support calculating several explicit configuration profiles rather than returning one context-free headline number.

## Official character API path

The headless wrapper's `loadBuildFromJSON` helper is promising because it uses PoB's own item/skill/passive import path and explicitly references GGG's documented character endpoint.

This does **not** remove the need for GGG OAuth registration or scope review. It simply means that once ExileQuesting obtains a valid documented character snapshot, the PoB kernel has an existing import path we can parity-test instead of writing a second item/passive importer for calculation purposes.

## Packaging questions still to resolve

Before shipping the kernel, the prototype must answer:

- exact LuaJIT/runtime distribution strategy on Windows;
- which PoB files are required for headless calculation;
- startup latency and memory cost;
- whether a warm persistent worker or bounded worker pool is appropriate;
- ASAR/extraResources layout;
- code-signing impact for the bundled runtime executable/DLLs;
- every third-party license/notice requirement;
- deterministic update/pinning strategy;
- crash/timeout diagnostics;
- Windows packaged-app behaviour under the existing installer/update gate.

These are release blockers, not reasons to rewrite PoB calculations in TypeScript.

## Safety boundary

The calculation kernel remains advisory and independent of the game process.

It must not:

- inject into Path of Exile;
- read game process memory;
- synthesize gameplay input;
- reverse-engineer undocumented GGG endpoints;
- turn PoB's own network features into hidden application dependencies.

Its job is deterministic offline calculation over explicitly supplied build/character state.
