# Path of Building calculation kernel

## Status

The first isolated headless calculation-kernel prototype is **working and parity-gated**.

Pinned engine pair for the current prototype:

- Path of Building repository: `PathOfBuildingCommunity/PathOfBuilding`
- PoB branch reviewed: `dev`
- PoB commit: `ed354c2f8c42e148bc904c7508dbe851fb2cf952`
- LuaJIT repository: `LuaJIT/LuaJIT`
- LuaJIT commit: `2460b3ff93a1c955de3d62cfc825de7d68dc272e`
- reviewed: 2026-09-03

The PoB pin still matches upstream `dev` as of the review date.

The prototype proves the calculation/process seam. It is **not yet a redistributed production dependency**. Windows runtime packaging, license-notice completion, startup/memory benchmarking, broader current-build parity and perturbations remain release blockers.

## Why the LuaJIT pin is part of calculation provenance

Current PoB source uses LuaJIT syntax extensions such as compound assignment (`+=`). Ubuntu's packaged LuaJIT could not parse the pinned PoB source, while the exact upstream LuaJIT revision used by PoB could.

The runtime is therefore not an incidental implementation detail. Every ExileQuesting calculation result records both:

- the PoB commit; and
- the LuaJIT runtime revision.

A future kernel pin update must treat this pair as one reviewed calculation-engine version.

## Upstream headless seam

Current Path of Building Community includes `src/HeadlessWrapper.lua`.

The wrapper states that it allows PoB to run headless. It stubs the graphical host, initializes PoB, then exposes the active build module as `build`.

Important helpers provided upstream include:

```lua
function loadBuildFromXML(xmlText, name)
    __mainObject__.main:SetMode("BUILD", false, name or "", xmlText)
    runCallback("OnFrame")
end

function loadBuildFromJSON(characterJSON)
    -- imports items/skills/passive tree/jewels
end
```

The upstream comment for `loadBuildFromJSON` explicitly calls out the documented GGG character API response as an example input. That remains especially useful for the planned optional OAuth-linked character snapshot.

PoB's `spec/GenerateBuilds.lua` demonstrates the calculation-output seam:

1. load XML through `loadBuildFromXML`;
2. read `build.calcsTab.mainOutput`;
3. serialize calculation outputs.

## Important parity-fixture lesson

PoB contains historical generated `spec/TestBuilds/*.lua` output snapshots, but the normal `.busted` configuration explicitly excludes tests tagged `#builds`.

Those committed historical output tables therefore must **not** be treated as evergreen current-calculation truth.

The ExileQuesting parity gate instead performs a fresh calculation for each fixture at the exact pinned PoB/LuaJIT pair:

```text
same pinned XML fixture
       |                         |
       v                         v
independent raw PoB          ExileQuesting worker
reference process            + IPC + normalization
       |                         |
       +----------- compare -----+
```

The reference runner loads the fixture through upstream `HeadlessWrapper.lua` and exposes a bounded set of raw `build.calcsTab.mainOutput` fields. It intentionally does not share ExileQuesting's request protocol or normalization implementation.

This tests the bridge ExileQuesting owns without depending on stale historical numeric snapshots.

## Why XML is the preferred worker input

ExileQuesting already performs bounded PoB export-code decompression and XML parsing in TypeScript. The calculation worker therefore does not need to own remote fetching or compressed share-code parsing.

Current boundary:

```text
pobb.in / export code / local XML
        |
        v
ExileQuesting hardened importer
        |
        v
validated PoB XML
        |
        v
isolated pinned LuaJIT + PoB worker
        |
        v
normalized calculation result
```

This keeps network policy, remote-response bounds and input parsing in the existing Electron/TypeScript security boundary.

## Implemented worker process design

The first worker prototype lives outside the Electron renderer and main-process calculation logic.

Implemented properties:

- dedicated LuaJIT child process using the exact pinned runtime;
- pinned PoB checkout/runtime supplied explicitly by the parent;
- newline-delimited JSON request transport;
- sentinel-prefixed JSON response channel so ordinary PoB console output cannot corrupt IPC;
- XML and request-ID bounds;
- hard execution timeout;
- bounded stdout/stderr capture;
- `shell: false` child-process launch;
- no arbitrary Lua supplied through the UI;
- no game-process access or gameplay automation;
- no network dependency inside normal calculation execution;
- diagnostic stdout/stderr tails on worker failures;
- worker provenance returned with every result;
- perturbations refused until the base calculation gate is established.

Implemented operations:

1. `health`
2. `load-and-calculate`
3. `calculate-with-perturbations` protocol shape, currently deliberately rejected by the worker

The current prototype starts a fresh process per request. Warm persistent workers are intentionally deferred until startup/memory/crash-recovery measurements justify the added lifecycle complexity.

## Lua module-path requirements

PoB needs both its source modules and runtime Lua libraries available to `require()`.

The worker therefore builds a module path containing:

```text
<pob>/src/?.lua
<pob>/src/?/init.lua
<pob>/runtime/lua/?.lua
<pob>/runtime/lua/?/init.lua
<reviewed host Lua paths, when required>
```

Replacing Lua's module path with runtime-only entries caused PoB startup to fail on modules such as `Data.PearlSupports`. This is now covered by the real parity workflow rather than relying on a synthetic process mock.

## Normalized output contract

The rest of ExileQuesting must not depend directly on every key in `build.calcsTab.mainOutput`.

The adapter currently normalizes a reviewed subset.

### Offence

Current prototype fields include:

- `FullDPS` / selected total-DPS fallback;
- `CombinedDPS`;
- hit DPS (`TotalDPS`);
- total DoT DPS;
- ignite, bleed, poison and impale components where available;
- average hit;
- speed / hit rate;
- hit chance;
- crit chance and multiplier;
- preliminary trigger-rate signal.

### Defence and recovery

Current prototype fields include:

- life;
- energy shield;
- mana;
- ward;
- total EHP output;
- physical/fire/cold/lightning/chaos maximum-hit outputs;
- armour;
- evasion;
- spell suppression;
- attack/spell block;
- elemental/chaos resistance and overcap outputs;
- life/ES regeneration and leech outputs;
- net recovery/degen outputs;
- guard-skill-active state.

### Provenance and warnings

Each result includes:

- ExileQuesting calculation-protocol version;
- PoB repository + exact commit;
- Lua runtime/version + exact LuaJIT commit;
- adapter version;
- explicit scenario metadata;
- warnings such as active guard-skill influence or missing verified runtime provenance.

This is only the first reviewed field set. Damage composition, penetration/enemy-resistance state, configuration provenance and mechanic-specific breakpoints still need deeper adapters.

## Current parity gate

A dedicated CI workflow builds the exact pinned LuaJIT revision, verifies the exact pinned PoB checkout, and executes real headless calculations.

The first bridge-parity run now passes fresh reference comparisons for:

- Occultist Vortex;
- dual-wield Cospri's Cast on Critical Strike;
- Mirage Archer Toxic Rain.

Current result on the first green gate:

- Occultist Vortex: 23 normalized numeric fields compared;
- dual-wield Cospri's CoC: 23 fields compared;
- Mirage Archer Toxic Rain: 22 fields compared;
- all comparisons passed.

These fixtures prove process/adapter parity, not expert-mechanic coverage. They are intentionally **not** sufficient to mark the endgame calculator expert-ready.

## Broader current-build parity requirements

Before Build Doctor consumes the kernel for player-facing expert recommendations, parity/behaviour validation must expand across current 3.29 builds covering at minimum:

- direct-hit crit projectile/attack;
- spell hit;
- non-ailment DoT;
- ignite;
- poison;
- bleed;
- minions;
- totems/ballistas;
- trigger/CoC-style mechanics;
- charge/attribute/resource stackers;
- slam/exert/warcry mechanics;
- RF/self-damage/recovery interactions;
- armour-heavy defence;
- evasion/suppression defence;
- ES/CI defence;
- block/max-res/recovery-heavy defence.

Strong current 3.29 research candidates include mechanically distinct RF, Earthshatter, CI CoC, strength-stacking and poison-minion setups. Public creator builds are useful behavioural research inputs, but their mutable/public PoB links should not silently become immutable release truth.

The long-term benchmark should combine:

- deterministic project-owned or redistributable fixtures;
- current public build research with provenance;
- deliberately broken/mutated cases;
- expert-reviewed expected diagnoses.

## Sensitivity / perturbation phase

Base bridge parity is now sufficient to begin controlled perturbation research, but mutation operations remain disabled in the production-facing worker until each operation has its own parity tests.

Planned mutation primitives include:

- bounded synthetic stat modifier;
- disable/replace a support gem;
- replace an item;
- allocate/deallocate a passive node;
- change a configuration condition;
- change attack/cast/trigger-rate inputs;
- add/remove defence layers.

Every perturbation must produce:

- a before calculation;
- an after calculation;
- normalized deltas;
- exact engine provenance;
- mutation provenance;
- breakpoint/cap warnings where the relationship is not smooth.

The purpose is not to invent universal stat weights. It is to experimentally establish what the **current build** responds to.

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

This does **not** remove the need for GGG OAuth registration or scope review. It means that once ExileQuesting obtains a valid documented character snapshot, the calculation kernel has an existing import path we can parity-test instead of writing a second calculation-specific item/passive importer.

## Benchmarking still required

Before choosing a persistent-worker architecture, measure on representative builds:

- cold worker startup time;
- XML load + first calculation latency;
- repeated calculation latency;
- resident memory;
- process teardown;
- timeout behaviour;
- malformed-build failure behaviour;
- crash recovery;
- concurrency behaviour if multiple comparisons are requested;
- Windows packaged-app behaviour.

A warm worker or small bounded worker pool should be adopted only if measurements justify it.

## Packaging and licensing still to resolve

Before shipping the kernel:

- audit PoB MIT license obligations and bundled third-party notices in detail;
- audit LuaJIT/runtime redistribution requirements;
- define the minimal PoB file set required for headless calculation;
- package the runtime and PoB files as an independent `extraResource` rather than weakening ASAR/Electron sandbox boundaries;
- verify Windows runtime executable/DLL behaviour and code-signing implications;
- gate packaged startup/calculation on the existing Windows installer workflow;
- establish deterministic kernel-update staging and rollback;
- never mutate the active production engine merely because upstream moved.

## Safety boundary

The calculation kernel remains advisory and independent of the game process.

It must not:

- inject into Path of Exile;
- read game process memory;
- synthesize gameplay input;
- reverse-engineer undocumented GGG endpoints;
- turn PoB's own network features into hidden application dependencies.

Its job is deterministic offline calculation over explicitly supplied build/character state.
